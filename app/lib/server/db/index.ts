import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { schemaSql } from './schema';

const defaultPath = resolve(process.cwd(), 'data/yunqian.db');
const dbPath = resolve(process.env.DB_PATH ?? defaultPath);

function createDb(): DatabaseSync {
  mkdirSync(dirname(dbPath), { recursive: true });
  const database = new DatabaseSync(dbPath);
  database.exec('PRAGMA foreign_keys = ON;');
  database.exec('PRAGMA journal_mode = WAL;');
  database.exec('PRAGMA busy_timeout = 5000;');
  database.exec(schemaSql);
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
