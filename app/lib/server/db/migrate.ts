import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Db } from './index';

/**
 * SQLite → PostgreSQL 一次性数据迁移。
 *
 * 触发条件(同时满足,在启动初始化事务内调用):
 * 1. PostgreSQL 的 users 表为空(全新库或已迁移过的库不会重复执行);
 * 2. 存在旧版 SQLite 数据文件(Railway 上 Volume 挂载在 /data/yunqian.db,
 *    本地为 <cwd>/data/yunqian.db,可用 DB_PATH 覆盖)。
 *
 * 全表按主键顺序复制并保留原 id(存量 JWT 中的 userId 继续有效),
 * 完成后把各表自增序列拨到 MAX(id)。迁移成功后旧文件原样保留作为备份。
 */

// 按外键依赖排序:users → collections(自引用按 id 序保证父先于子)→ bookmarks → tags → bookmark_tags
const TABLES_WITH_ID = ['users', 'collections', 'bookmarks', 'tags'] as const;
const LINK_TABLES = ['bookmark_tags'] as const;
const ALL_TABLES = [...TABLES_WITH_ID, ...LINK_TABLES, 'schema_migrations'] as const;

function legacySqlitePath(): string {
  if (process.env.DB_PATH) return resolve(process.env.DB_PATH);
  return resolve(process.cwd(), 'data/yunqian.db');
}

export async function migrateFromSqliteIfEmpty(db: Db): Promise<void> {
  const existing = await db.get<{ count: number }>('SELECT COUNT(*) AS count FROM users');
  if (existing && existing.count > 0) return;

  const legacyPath = legacySqlitePath();
  if (!existsSync(legacyPath)) return;

  const { DatabaseSync } = await import('node:sqlite');
  const sqlite = new DatabaseSync(legacyPath);
  try {
    console.log(`[migrate] 检测到旧版 SQLite 数据文件 ${legacyPath},开始迁移到 PostgreSQL...`);
    const tableExists = (table: string) =>
      Boolean(sqlite.prepare(`SELECT 1 AS one FROM sqlite_master WHERE type='table' AND name=?`).get(table));
    const summary: string[] = [];
    for (const table of ALL_TABLES) {
      if (!tableExists(table)) continue;
      const hasId = (TABLES_WITH_ID as readonly string[]).includes(table);
      const orderBy = hasId ? ' ORDER BY id' : '';
      const rows = sqlite.prepare(`SELECT * FROM ${table}${orderBy}`).all() as Array<Record<string, unknown>>;
      if (rows.length === 0) continue;
      const columns = Object.keys(rows[0]);
      const columnList = columns.join(', ');
      const placeholders = columns.map(() => '?').join(', ');
      for (const row of rows) {
        await db.run(
          `INSERT INTO ${table} (${columnList}) VALUES (${placeholders})`,
          columns.map((column) => row[column]),
        );
      }
      summary.push(`${table}: ${rows.length} 行`);
    }
    for (const table of TABLES_WITH_ID) {
      await db.run(
        `SELECT setval(pg_get_serial_sequence('${table}', 'id'), GREATEST((SELECT MAX(id) FROM ${table}), 1))`,
      );
    }
    console.log(`[migrate] 迁移完成 → ${summary.join(', ') || '无数据'}。旧文件已保留在原处作为备份。`);
  } catch (error) {
    console.error('[migrate] SQLite 数据迁移失败,服务将拒绝启动以免出现空库假象:', error);
    throw error;
  } finally {
    sqlite.close();
  }
}
