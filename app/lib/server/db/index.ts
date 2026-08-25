import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { hashPassword } from '../lib/crypto';
import { schemaSql } from './schema';

const defaultPath = resolve(process.cwd(), 'data/yunqian.db');
const dbPath = resolve(process.env.DB_PATH ?? defaultPath);

function initAdmin(database: DatabaseSync): void {
  try {
    const admin = database.prepare('SELECT id FROM users WHERE id = 1').get() as { id: number } | undefined;
    if (!admin) {
      const timestamp = new Date().toISOString();
      const defaultPassword = process.env.INITIAL_ADMIN_PASSWORD || 'admin123';
      const passwordHash = hashPassword(defaultPassword);
      database.prepare(`
        INSERT INTO users (id, username, email, password_hash, role, nickname, status, created_at, updated_at)
        VALUES (1, 'admin', NULL, ?, 'admin', '系统管理员', 'active', ?, ?)
      `).run(passwordHash, timestamp, timestamp);
    }
  } catch (error) {
    console.error('Failed to initialize default admin:', error);
  }
}

function createDb(): DatabaseSync {
  mkdirSync(dirname(dbPath), { recursive: true });
  const database = new DatabaseSync(dbPath);
  database.exec('PRAGMA foreign_keys = ON;');
  database.exec('PRAGMA journal_mode = WAL;');
  database.exec('PRAGMA busy_timeout = 5000;');
  database.exec(schemaSql);
  initAdmin(database);
  return database;
}

type GlobalWithDb = typeof globalThis & { __yunqianDb?: DatabaseSync };

export function getDb(): DatabaseSync {
  const globalWithDb = globalThis as GlobalWithDb;
  if (!globalWithDb.__yunqianDb) {
    globalWithDb.__yunqianDb = createDb();
  }
  return globalWithDb.__yunqianDb;
}

export function now(): string {
  return new Date().toISOString();
}

export function inTransaction<T>(work: () => T): T {
  const database = getDb();
  database.exec('BEGIN IMMEDIATE;');
  try {
    const result = work();
    database.exec('COMMIT;');
    return result;
  } catch (error) {
    database.exec('ROLLBACK;');
    throw error;
  }
}
