/**
 * 本地开发用 PostgreSQL 启动器(基于 embedded-postgres,免安装、免 Docker)。
 *
 * 用法:pnpm db:start
 * - 数据目录:.pgdata/(首次自动初始化,gitignore 已忽略)
 * - 端口:5433(避开本机可能存在的 5432)
 * - 连接串会自动写入 .env.local,`pnpm dev` 直接可用
 * - Ctrl+C 优雅停止数据库
 */
import { existsSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import EmbeddedPostgres from 'embedded-postgres';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = resolve(appRoot, '.pgdata');
const port = Number(process.env.PG_PORT || 5433);
const user = 'yunqian';
const password = 'yunqian';
const database = 'yunqian';
const databaseUrl = `postgres://${user}:${password}@localhost:${port}/${database}`;

const pg = new EmbeddedPostgres({ databaseDir: dataDir, user, password, port, persistent: true });

console.log('[dev-db] 启动本地 PostgreSQL(embedded-postgres)...');
if (!existsSync(dataDir)) {
  console.log('[dev-db] 首次运行,初始化数据目录 .pgdata/');
  await pg.initialise();
}
await pg.start();
try {
  await pg.createDatabase(database);
  console.log(`[dev-db] 已创建数据库 ${database}`);
} catch {
  console.log(`[dev-db] 数据库 ${database} 已存在,跳过创建`);
}

// 把连接串写进 .env.local(next dev 自动读取);保留文件里的其他配置
const envPath = resolve(appRoot, '.env.local');
let envContent = '';
if (existsSync(envPath)) {
  envContent = readFileSync(envPath, 'utf8').replace(/^DATABASE_URL=.*$/m, '');
}
envContent = `${envContent.trim()}\nDATABASE_URL=${databaseUrl}\n`.replace(/^\n+/, '');
writeFileSync(envPath, envContent);

console.log(`[dev-db] PostgreSQL 就绪 → ${databaseUrl}`);
console.log('[dev-db] 已写入 .env.local,另开终端运行 pnpm dev 即可。按 Ctrl+C 停止数据库。');

let stopping = false;
const shutdown = async () => {
  if (stopping) return;
  stopping = true;
  console.log('\n[dev-db] 停止数据库...');
  try {
    await pg.stop();
  } catch (error) {
    console.error('[dev-db] 停止时出错(数据不受影响):', error?.message ?? error);
  }
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
