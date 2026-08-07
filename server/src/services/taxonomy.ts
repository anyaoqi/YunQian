import { db, inTransaction, now } from '../db/index.js';
import { AppError, notFound } from '../lib/errors.js';
import type { Collection, Tag } from '../types.js';

type CollectionRow = Omit<Collection, 'children'>;

function getCollectionRow(id: number): CollectionRow | undefined {
  const row = db.prepare(`
    SELECT c.id, c.name, c.parent_id AS parentId, c.icon, c.color, c.sort_order AS sortOrder,
      COUNT(b.id) AS bookmarkCount,
      COALESCE(SUM(b.is_favorite), 0) AS favoriteCount
    FROM collections c LEFT JOIN bookmarks b ON b.collection_id = c.id AND b.deleted_at IS NULL
    WHERE c.id = ? GROUP BY c.id
  `).get(id) as CollectionRow | undefined;
  return row;
}

function assertParentExists(parentId: number | null): void {
  if (parentId !== null && !getCollectionRow(parentId)) throw notFound('父分类');
}

function assertSiblingNameAvailable(name: string, parentId: number | null, ignoreId?: number): void {
  const sql = parentId === null
    ? 'SELECT id FROM collections WHERE user_id = 1 AND parent_id IS NULL AND name = ?'
    : 'SELECT id FROM collections WHERE user_id = 1 AND parent_id = ? AND name = ?';
  const params: (string | number)[] = parentId === null ? [name] : [parentId, name];
  const found = db.prepare(sql).get(...params) as { id: number } | undefined;
  if (found && found.id !== ignoreId) throw new AppError(409, 'DUPLICATE_NAME', '同级分类中已存在该名称');
}

export function listCollections(): Collection[] {
  const rows = db.prepare(`
    SELECT c.id, c.name, c.parent_id AS parentId, c.icon, c.color, c.sort_order AS sortOrder,
      COUNT(b.id) AS bookmarkCount,
      COALESCE(SUM(b.is_favorite), 0) AS favoriteCount
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

export function updateCollection(id: number, input: Partial<{ name: string; parentId: number | null; icon: string | null; color: string | null; sortOrder: number }>): Collection {
  const current = getCollectionRow(id);
  if (!current) throw notFound('分类');
  const parentId = input.parentId === undefined ? current.parentId : input.parentId;
  if (parentId === id || (parentId !== null && isDescendant(parentId, id))) {
    throw new AppError(422, 'INVALID_PARENT', '不能将分类移动到自身或其子分类中');
  }
  assertParentExists(parentId);
  const name = input.name ?? current.name;
  assertSiblingNameAvailable(name, parentId, id);
  db.prepare(`UPDATE collections SET name=?, parent_id=?, icon=?, color=?, sort_order=?, updated_at=? WHERE id=?`).run(
    name, parentId, input.icon === undefined ? current.icon : input.icon,
    input.color === undefined ? current.color : input.color,
    input.sortOrder === undefined ? current.sortOrder : input.sortOrder,
    now(), id,
  );
  const row = getCollectionRow(id);
  if (!row) throw new Error('Collection update failed');
  return { ...row, children: [] };
}

export function deleteCollection(id: number): void {
  const current = getCollectionRow(id);
  if (!current) throw notFound('分类');
  inTransaction(() => {
    db.prepare('UPDATE bookmarks SET collection_id=NULL, updated_at=? WHERE collection_id=?').run(now(), id);
    db.prepare('UPDATE collections SET parent_id=?, updated_at=? WHERE parent_id=?').run(current.parentId, now(), id);
    db.prepare('DELETE FROM collections WHERE id=?').run(id);
  });
}

/**
 * 按 orderedIds 顺序重写同一父分类下子分类的 sort_order。
 * 校验：所有 id 必须属于该 parent 且无遗漏、无多余。
 */
export function reorderCollections(parentId: number | null, orderedIds: number[]): void {
  const sql = parentId === null
    ? 'SELECT id FROM collections WHERE user_id=1 AND parent_id IS NULL'
    : 'SELECT id FROM collections WHERE user_id=1 AND parent_id=?';
  const existing = (db.prepare(sql).all(...(parentId === null ? [] : [parentId])) as Array<{ id: number }>).map((r) => r.id);
  const existingSet = new Set(existing);
  if (existing.length !== orderedIds.length) throw new AppError(422, 'INVALID_REORDER', '排序数量与同层分类数量不一致');
  for (const id of orderedIds) {
    if (!existingSet.has(id)) throw new AppError(422, 'INVALID_REORDER', '存在不属于该层的分类 id');
  }
  inTransaction(() => {
    const stmt = db.prepare('UPDATE collections SET sort_order=?, updated_at=? WHERE id=?');
    orderedIds.forEach((id, index) => stmt.run(index, now(), id));
  });
}

export function listTags(): Tag[] {
  return db.prepare(`
    SELECT t.id, t.name, t.color, COUNT(b.id) AS count
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

function getTagRow(id: number): Tag | undefined {
  return db.prepare('SELECT id, name, color, 0 AS count FROM tags WHERE id=?').get(id) as Tag | undefined;
}

export function updateTag(id: number, input: Partial<{ name: string; color: string | null }>): Tag {
  const current = getTagRow(id);
  if (!current) throw notFound('标签');
  const name = input.name ?? current.name;
  const color = input.color === undefined ? current.color : input.color;
  const existing = db.prepare('SELECT id FROM tags WHERE user_id=1 AND name=? AND id<>?').get(name, id) as { id: number } | undefined;
  if (existing) throw new AppError(409, 'DUPLICATE_NAME', '标签名称已存在');
  db.prepare('UPDATE tags SET name=?, color=? WHERE id=?').run(name, color, id);
  return { ...current, name, color };
}

export function mergeTags(sourceId: number, targetId: number): { moved: number } {
  if (sourceId === targetId) throw new AppError(422, 'INVALID_MERGE', '不能合并到自身');
  const source = getTagRow(sourceId);
  const target = getTagRow(targetId);
  if (!source || !target) throw notFound('标签');
  const existing = db.prepare('SELECT bookmark_id FROM bookmark_tags WHERE tag_id=?').all(sourceId) as Array<{ bookmark_id: number }>;
  db.prepare('DELETE FROM bookmark_tags WHERE tag_id=?').run(sourceId);
  let moved = 0;
  for (const { bookmark_id: bookmarkId } of existing) {
    const duplicate = db.prepare('SELECT 1 FROM bookmark_tags WHERE bookmark_id=? AND tag_id=?').get(bookmarkId, targetId);
    if (!duplicate) {
      db.prepare('INSERT INTO bookmark_tags (bookmark_id, tag_id) VALUES (?, ?)').run(bookmarkId, targetId);
      moved++;
    }
  }
  db.prepare('DELETE FROM tags WHERE id=?').run(sourceId);
  return { moved };
}

export function cleanOrphanTags(): { deleted: number } {
  const result = db.prepare(`DELETE FROM tags WHERE id NOT IN (SELECT DISTINCT tag_id FROM bookmark_tags)`).run();
  return { deleted: Number(result.changes) };
}
