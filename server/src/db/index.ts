import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { schemaSql } from './schema.js';

const defaultPath = resolve(dirname(fileURLToPath(import.meta.url)), '../../data/linknest.db');
const dbPath = resolve(process.env.DB_PATH ?? defaultPath);
mkdirSync(dirname(dbPath), { recursive: true });

export const db = new DatabaseSync(dbPath);
db.exec('PRAGMA foreign_keys = ON;');
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA busy_timeout = 5000;');
db.exec(schemaSql);

export function now(): string {
  return new Date().toISOString();
}

export function inTransaction<T>(work: () => T): T {
  db.exec('BEGIN IMMEDIATE;');
  try {
    const result = work();
    db.exec('COMMIT;');
    return result;
  } catch (error) {
    db.exec('ROLLBACK;');
    throw error;
  }
}
