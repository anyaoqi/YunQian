import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { hashPassword } from '../lib/crypto';
import { migrateFromSqliteIfEmpty } from './migrate';
import { schemaSql } from './schema';

// COUNT(*)/SUM() 在 PostgreSQL 返回 int8,pg 驱动默认解析为字符串;
// 全局改写为 number,与原 SQLite 行为一致。
pg.types.setTypeParser(20, (value: string) => Number(value));

/**
 * 将 SQLite 风格的 `?` 占位符转换为 PostgreSQL 的 `$n` 形式,
 * 使既有 SQL 文本可以原样复用。字符串/标识符字面量中的 ? 不会被转换。
 */
function toPgSql(sql: string): string {
  let out = '';
  let index = 1;
  let inString = false;
  let inIdentifier = false;
  for (let i = 0; i < sql.length; i += 1) {
    const ch = sql[i];
    if (ch === "'" && !inIdentifier) inString = !inString;
    else if (ch === '"' && !inString) inIdentifier = !inIdentifier;
    if (ch === '?' && !inString && !inIdentifier) {
      out += `$${index}`;
      index += 1;
    } else {
      out += ch;
    }
  }
  return out;
}

// 注意:executor 在无参数时必须不传 values 调用 query(走简单查询协议),
// 否则 pg 会用参数化协议,拒绝一次执行多条语句(建表 DDL 是整段多语句)。
export type DbExecutor = (sql: string, params: unknown[] | undefined) => Promise<pg.QueryResult>;

/**
 * 数据库门面:all/get/run 与原 node:sqlite 的 .all()/.get()/.run() 语义对齐,
 * SQL 仍使用 `?` 占位符。事务外的查询走连接池,事务内绑定同一客户端连接。
 */
export class Db {
  constructor(private readonly executor: DbExecutor) {}

  private exec(sql: string, params: unknown[]): Promise<pg.QueryResult> {
    return this.executor(toPgSql(sql), params.length > 0 ? params : undefined);
  }

  async all<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    const result = await this.exec(sql, params);
    return result.rows as T[];
  }

  async get<T>(sql: string, params: unknown[] = []): Promise<T | undefined> {
    const rows = await this.all<T>(sql, params);
    return rows[0];
  }

  /** UPDATE/DELETE 返回受影响行数;INSERT 需要新 id 时用 `... RETURNING id` + get()。 */
  async run(sql: string, params: unknown[] = []): Promise<{ changes: number }> {
    const result = await this.exec(sql, params);
    return { changes: result.rowCount ?? 0 };
  }
}

const poolExecutor = (pool: pg.Pool): DbExecutor => (sql, params) =>
  params && params.length > 0 ? pool.query(sql, params) : pool.query(sql);

const clientExecutor = (client: pg.PoolClient): DbExecutor => (sql, params) =>
  params && params.length > 0 ? client.query(sql, params) : client.query(sql);

type GlobalWithDb = typeof globalThis & { __yunqianDbState?: { pool: pg.Pool; initPromise: Promise<Db> } };

function getGlobal(): GlobalWithDb {
  return globalThis as GlobalWithDb;
}

function createPool(): pg.Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      '[db] 缺少 DATABASE_URL 环境变量。PostgreSQL 连接串示例: postgres://user:pass@host:5432/dbname',
    );
  }
  return new pg.Pool({ connectionString, max: 10, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 10_000 });
}

/**
 * 管理员初始密码来源:
 * - 显式配置 INITIAL_ADMIN_PASSWORD(至少 8 位)时使用;
 * - 生产环境未配置时生成随机密码并仅在启动日志中打印一次,绝不回退到固定默认值;
 * - 开发环境保留 admin123 便于本地联调(登录页会提示修改)。
 */
function adminPasswordForBootstrap(): string {
  const fromEnv = process.env.INITIAL_ADMIN_PASSWORD;
  if (fromEnv && fromEnv.length >= 8) return fromEnv;
  if (process.env.NODE_ENV === 'production') {
    const password = randomBytes(12).toString('base64url');
    console.warn('[db] 未配置 INITIAL_ADMIN_PASSWORD,已为 admin 生成随机初始密码(仅显示此次,请立即登录并修改):');
    console.warn(`[db] admin 初始密码: ${password}`);
    return password;
  }
  console.warn('[db] 开发环境使用默认管理员密码 admin123,生产环境请配置 INITIAL_ADMIN_PASSWORD。');
  return 'admin123';
}

async function ensureAdminUser(db: Db): Promise<void> {
  const existing = await db.get<{ id: number }>('SELECT id FROM users WHERE id = 1');
  if (existing) return;
  const timestamp = new Date().toISOString();
  const password = adminPasswordForBootstrap();
  await db.run(
    `INSERT INTO users (id, username, email, password_hash, role, nickname, status, created_at, updated_at)
     VALUES (1, 'admin', NULL, ?, 'admin', '系统管理员', 'active', ?, ?)
     ON CONFLICT (id) DO NOTHING`,
    [hashPassword(password), timestamp, timestamp],
  );
  await db.run(`SELECT setval(pg_get_serial_sequence('users', 'id'), GREATEST((SELECT MAX(id) FROM users), 1))`);
}

// advisory lock 标识,固定随机值,仅用于启动初始化互斥
const INIT_LOCK_ID = 7_240_110_01;

/**
 * 启动初始化(每个进程仅一次,失败会让首个请求快速失败):
 * advisory lock → 建扩展/表(幂等) → SQLite 存量数据迁移(如适用) → 管理员引导。
 */
async function initDb(pool: pg.Pool): Promise<Db> {
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [INIT_LOCK_ID]);
    try {
      await client.query('BEGIN');
      const db = new Db(clientExecutor(client));
      await db.run(schemaSql);
      await migrateFromSqliteIfEmpty(db);
      await ensureAdminUser(db);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [INIT_LOCK_ID]).catch(() => {});
    client.release();
  }
  return new Db(poolExecutor(pool));
}

function getDbState(): { pool: pg.Pool; initPromise: Promise<Db> } {
  const globalWithDb = getGlobal();
  if (!globalWithDb.__yunqianDbState) {
    const pool = createPool();
    // 初始化失败时清空缓存,允许下一次请求重试(而不是永久卡在 rejected promise)
    const initPromise = initDb(pool).catch((error) => {
      globalWithDb.__yunqianDbState = undefined;
      throw error;
    });
    globalWithDb.__yunqianDbState = { pool, initPromise };
  }
  return globalWithDb.__yunqianDbState;
}

/** 事务外使用的默认连接池门面。 */
export const db = {
  async all<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    const state = getDbState();
    const initialized = await state.initPromise;
    return initialized.all<T>(sql, params);
  },
  async get<T>(sql: string, params: unknown[] = []): Promise<T | undefined> {
    const state = getDbState();
    const initialized = await state.initPromise;
    return initialized.get<T>(sql, params);
  },
  async run(sql: string, params: unknown[] = []): Promise<{ changes: number }> {
    const state = getDbState();
    const initialized = await state.initPromise;
    return initialized.run(sql, params);
  },
};

/**
 * 在单个事务中执行(work 内所有查询走同一连接,整体提交或回滚)。
 * work 接收一个绑定到事务连接的 Db,事务内的辅助函数都应使用它。
 */
export async function inTransaction<T>(work: (tx: Db) => Promise<T> | T): Promise<T> {
  const state = getDbState();
  await state.initPromise;
  const client = await state.pool.connect();
  try {
    await client.query('BEGIN');
    const tx = new Db(clientExecutor(client));
    try {
      const result = await work(tx);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    }
  } finally {
    client.release();
  }
}

/** 健康检查用:验证数据库连通。 */
export async function checkDatabaseConnection(): Promise<void> {
  await db.run('SELECT 1');
}

export function now(): string {
  return new Date().toISOString();
}
