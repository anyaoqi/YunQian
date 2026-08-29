/**
 * 构造旧版 SQLite 数据库文件(app/data/yunqian.db),用于验证 SQLite→PG 自动迁移。
 * 用法:node scripts/make-legacy-fixture.mjs [--force]
 */
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { randomBytes, scryptSync } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dbPath = resolve(appRoot, 'data/yunqian.db');
if (existsSync(dbPath)) {
  if (!process.argv.includes('--force')) {
    console.error(`已存在 ${dbPath},加 --force 覆盖`);
    process.exit(1);
  }
  rmSync(dbPath);
}

function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}

const ts = new Date().toISOString();
const db = new DatabaseSync(dbPath);
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL COLLATE NOCASE,
    email TEXT COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('admin', 'user')),
    nickname TEXT,
    avatar_url TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'disabled')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE collections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL DEFAULT 1 REFERENCES users(id) ON DELETE CASCADE,
    parent_id INTEGER REFERENCES collections(id) ON DELETE SET NULL,
    name TEXT NOT NULL, icon TEXT, color TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
    UNIQUE(user_id, parent_id, name)
  );
  CREATE TABLE bookmarks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL DEFAULT 1 REFERENCES users(id) ON DELETE CASCADE,
    collection_id INTEGER REFERENCES collections(id) ON DELETE SET NULL,
    url TEXT NOT NULL, title TEXT NOT NULL DEFAULT '',
    description TEXT, note TEXT, favicon_url TEXT, cover_url TEXT,
    is_favorite INTEGER NOT NULL DEFAULT 0 CHECK(is_favorite IN (0, 1)),
    click_count INTEGER NOT NULL DEFAULT 0, last_visited_at TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT,
    UNIQUE(user_id, url)
  );
  CREATE TABLE tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL DEFAULT 1 REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL, color TEXT,
    created_at TEXT NOT NULL,
    UNIQUE(user_id, name)
  );
  CREATE TABLE bookmark_tags (
    bookmark_id INTEGER NOT NULL REFERENCES bookmarks(id) ON DELETE CASCADE,
    tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY(bookmark_id, tag_id)
  );
`);

const insertUser = db.prepare(
  'INSERT INTO users (id, username, email, password_hash, role, nickname, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
insertUser.run(1, 'admin', null, hashPassword('admin123'), 'admin', '系统管理员', 'active', ts, ts);
insertUser.run(2, 'alice', 'alice@example.com', hashPassword('alice12345'), 'user', '爱丽丝', 'active', ts, ts);
insertUser.run(3, 'bob', null, hashPassword('bob12345678'), 'user', null, 'active', ts, ts);

db.prepare('INSERT INTO collections (id, user_id, parent_id, name, icon, color, sort_order, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)')
  .run(1, 2, null, '工作', '💼', '#4f7cff', 0, ts, ts);
db.prepare('INSERT INTO collections (id, user_id, parent_id, name, icon, color, sort_order, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)')
  .run(2, 2, 1, '前端开发', '⚡', '#22b573', 1, ts, ts);

const insertBm = db.prepare(`INSERT INTO bookmarks
  (id, user_id, collection_id, url, title, description, note, is_favorite, click_count, created_at, updated_at, deleted_at)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
insertBm.run(1, 2, 1, 'https://github.com/', 'GitHub', '代码托管平台', null, 1, 42, ts, ts, null);
insertBm.run(2, 2, 2, 'https://nextjs.org/', 'Next.js', null, '官方文档', 0, 7, ts, ts, null);
insertBm.run(3, 2, null, 'https://example.com/', 'Example', null, null, 0, 0, ts, ts, ts);
insertBm.run(4, 3, null, 'https://nodejs.org/', 'Node.js', null, null, 0, 1, ts, ts, null);

db.prepare('INSERT INTO tags (id, user_id, name, color, created_at) VALUES (?,?,?,?,?)').run(1, 2, '开发', '#3498db', ts);
db.prepare('INSERT INTO tags (id, user_id, name, color, created_at) VALUES (?,?,?,?,?)').run(2, 2, '文档', '#1abc9c', ts);
db.prepare('INSERT INTO bookmark_tags (bookmark_id, tag_id) VALUES (?,?)').run(1, 1);
db.prepare('INSERT INTO bookmark_tags (bookmark_id, tag_id) VALUES (?,?)').run(2, 2);

db.close();
console.log(`已生成旧版 SQLite 夹具: ${dbPath}`);
console.log('用户: admin/admin123, alice/alice12345, bob/bob12345678;alice 有 2 个分类、3 本书签(1 本在回收站)、2 个标签');
