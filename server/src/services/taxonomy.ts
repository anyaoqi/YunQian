import { db, inTransaction, now } from '../db/index.js';
import { AppError, notFound } from '../lib/errors.js';
import type { Collection, Tag } from '../types.js';

type CollectionRow = Omit<Collection, 'children'>;

function getCollectionRow(id: number): CollectionRow | undefined {
  const row = db.prepare(`
    SELECT c.id, c.name, c.parent_id AS parentId, c.icon, c.color, c.sort_order AS sortOrder,
      COUNT(b.id) AS bookmarkCount
    FROM collections c LEFT JOIN bookmarks b ON b.collection_id = c.id AND b.deleted_at IS NULL
    WHERE c.id = ? GROUP BY c.id
  `).get(id) as CollectionRow | undefined;
  return row;
}

function assertParentExists(parentId: number | null): void {
  if (parentId !== null && !getCollectionRow(parentId)) throw notFound('父集合');
}

function assertSiblingNameAvailable(name: string, parentId: number | null, ignoreId?: number): void {
  const sql = parentId === null
    ? 'SELECT id FROM collections WHERE user_id = 1 AND parent_id IS NULL AND name = ?'
    : 'SELECT id FROM collections WHERE user_id = 1 AND parent_id = ? AND name = ?';
  const params: (string | number)[] = parentId === null ? [name] : [parentId, name];
  const found = db.prepare(sql).get(...params) as { id: number } | undefined;
  if (found && found.id !== ignoreId) throw new AppError(409, 'DUPLICATE_NAME', '同级集合中已存在该名称');
}

export function listCollections(): Collection[] {
  const rows = db.prepare(`
    SELECT c.id, c.name, c.parent_id AS parentId, c.icon, c.color, c.sort_order AS sortOrder,
      COUNT(b.id) AS bookmarkCount
    FROM collections c LEFT JOIN bookmarks b ON b.collection_id = c.id AND b.deleted_at IS NULL
    GROUP BY c.id ORDER BY c.sort_order ASC, c.name COLLATE NOCASE ASC
  `).all() as CollectionRow[];

  const byId = new Map<number, Collection>();
  for (const row of rows) byId.set(row.id, { ...row, children: [] });
  const roots: Collection[] = [];
  for (const collection of byId.values()) {
    if (collection.parentId !== null && byId.has(collection.parentId)) byId.get(collection.parentId)!.children.push(collection);
    else roots.push(collection);
  }
  return roots;
}

export function createCollection(input: { name: string; parentId: number | null; icon?: string | null; color?: string | null }): Collection {
  assertParentExists(input.parentId);
  assertSiblingNameAvailable(input.name, input.parentId);
  const timestamp = now();
  const result = db.prepare(`
    INSERT INTO collections (parent_id, name, icon, color, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(input.parentId, input.name, input.icon ?? null, input.color ?? null, timestamp, timestamp);
  const row = getCollectionRow(Number(result.lastInsertRowid));
  if (!row) throw new Error('Collection creation failed');
  return { ...row, children: [] };
}

function isDescendant(candidateId: number, ancestorId: number): boolean {
  const row = db.prepare(`
    WITH RECURSIVE tree(id) AS (
      SELECT id FROM collections WHERE id = ?
      UNION ALL SELECT c.id FROM collections c JOIN tree t ON c.parent_id = t.id
    ) SELECT 1 AS found FROM tree WHERE id = ? LIMIT 1
  `).get(ancestorId, candidateId) as { found: number } | undefined;
  return Boolean(row);
}

export function updateCollection(id: number, input: Partial<{ name: string; parentId: number | null; icon: string | null; color: string | null }>): Collection {
  const current = getCollectionRow(id);
  if (!current) throw notFound('集合');
  const parentId = input.parentId === undefined ? current.parentId : input.parentId;
  if (parentId === id || (parentId !== null && isDescendant(parentId, id))) {
    throw new AppError(422, 'INVALID_PARENT', '不能将集合移动到自身或其子集合中');
  }
  assertParentExists(parentId);
  const name = input.name ?? current.name;
  assertSiblingNameAvailable(name, parentId, id);
  db.prepare(`UPDATE collections SET name=?, parent_id=?, icon=?, color=?, updated_at=? WHERE id=?`).run(
    name, parentId, input.icon === undefined ? current.icon : input.icon,
    input.color === undefined ? current.color : input.color, now(), id,
  );
  const row = getCollectionRow(id);
  if (!row) throw new Error('Collection update failed');
  return { ...row, children: [] };
}

export function deleteCollection(id: number): void {
  const current = getCollectionRow(id);
  if (!current) throw notFound('集合');
  inTransaction(() => {
    db.prepare('UPDATE bookmarks SET collection_id=NULL, updated_at=? WHERE collection_id=?').run(now(), id);
    db.prepare('UPDATE collections SET parent_id=?, updated_at=? WHERE parent_id=?').run(current.parentId, now(), id);
    db.prepare('DELETE FROM collections WHERE id=?').run(id);
  });
}

export function listTags(): Tag[] {
  return db.prepare(`
    SELECT t.id, t.name, t.color, COUNT(bt.bookmark_id) AS count
    FROM tags t
    LEFT JOIN bookmark_tags bt ON bt.tag_id = t.id
    LEFT JOIN bookmarks b ON b.id = bt.bookmark_id AND b.deleted_at IS NULL
    GROUP BY t.id ORDER BY count DESC, t.name COLLATE NOCASE ASC
  `).all() as Tag[];
}

export function createTag(input: { name: string; color?: string | null }): Tag {
  const existing = db.prepare('SELECT id FROM tags WHERE user_id=1 AND name=?').get(input.name) as { id: number } | undefined;
  if (existing) throw new AppError(409, 'DUPLICATE_NAME', '标签名称已存在');
  const result = db.prepare('INSERT INTO tags (name, color, created_at) VALUES (?, ?, ?)').run(input.name, input.color ?? null, now());
  return { id: Number(result.lastInsertRowid), name: input.name, color: input.color ?? null, count: 0 };
}

export function deleteTag(id: number): void {
  const result = db.prepare('DELETE FROM tags WHERE id=?').run(id);
  if (result.changes === 0) throw notFound('标签');
}
