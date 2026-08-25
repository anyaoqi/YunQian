import { getDb, inTransaction, now } from '../db/index';
import { AppError, notFound } from '../lib/errors';
import type { Collection, Tag } from '../types';

type CollectionRow = Omit<Collection, 'children'>;

function getCollectionRow(userId: number, id: number): CollectionRow | undefined {
  const row = getDb().prepare(`
    SELECT c.id, c.name, c.parent_id AS parentId, c.icon, c.color, c.sort_order AS sortOrder,
      COUNT(b.id) AS bookmarkCount,
      COALESCE(SUM(b.is_favorite), 0) AS favoriteCount
    FROM collections c LEFT JOIN bookmarks b ON b.collection_id = c.id AND b.deleted_at IS NULL AND b.user_id = c.user_id
    WHERE c.id = ? AND c.user_id = ? GROUP BY c.id
  `).get(id, userId) as CollectionRow | undefined;
  return row;
}

function assertParentExists(userId: number, parentId: number | null): void {
  if (parentId !== null && !getCollectionRow(userId, parentId)) throw notFound('父分类');
}

function assertSiblingNameAvailable(userId: number, name: string, parentId: number | null, ignoreId?: number): void {
  const sql = parentId === null
    ? 'SELECT id FROM collections WHERE user_id = ? AND parent_id IS NULL AND name = ?'
    : 'SELECT id FROM collections WHERE user_id = ? AND parent_id = ? AND name = ?';
  const params: (string | number)[] = parentId === null ? [userId, name] : [userId, parentId, name];
  const found = getDb().prepare(sql).get(...params) as { id: number } | undefined;
  if (found && found.id !== ignoreId) throw new AppError(409, 'DUPLICATE_NAME', '同级分类中已存在该名称');
}

export function listCollections(userId: number): Collection[] {
  const rows = getDb().prepare(`
    SELECT c.id, c.name, c.parent_id AS parentId, c.icon, c.color, c.sort_order AS sortOrder,
      COUNT(b.id) AS bookmarkCount,
      COALESCE(SUM(b.is_favorite), 0) AS favoriteCount
    FROM collections c LEFT JOIN bookmarks b ON b.collection_id = c.id AND b.deleted_at IS NULL AND b.user_id = c.user_id
    WHERE c.user_id = ?
    GROUP BY c.id ORDER BY c.sort_order ASC, c.name COLLATE NOCASE ASC
  `).all(userId) as CollectionRow[];

  const byId = new Map<number, Collection>();
  for (const row of rows) byId.set(row.id, { ...row, children: [] });
  const roots: Collection[] = [];
  for (const collection of byId.values()) {
    if (collection.parentId !== null && byId.has(collection.parentId)) byId.get(collection.parentId)!.children.push(collection);
    else roots.push(collection);
  }
  return roots;
}

export function createCollection(userId: number, input: { name: string; parentId: number | null; icon?: string | null; color?: string | null }): Collection {
  assertParentExists(userId, input.parentId);
  assertSiblingNameAvailable(userId, input.name, input.parentId);
  const timestamp = now();
  const result = getDb().prepare(`
    INSERT INTO collections (user_id, parent_id, name, icon, color, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(userId, input.parentId, input.name, input.icon ?? null, input.color ?? null, timestamp, timestamp);
  const row = getCollectionRow(userId, Number(result.lastInsertRowid));
  if (!row) throw new Error('Collection creation failed');
  return { ...row, children: [] };
}

function isDescendant(userId: number, candidateId: number, ancestorId: number): boolean {
  const row = getDb().prepare(`
    WITH RECURSIVE tree(id) AS (
      SELECT id FROM collections WHERE id = ? AND user_id = ?
      UNION ALL SELECT c.id FROM collections c JOIN tree t ON c.parent_id = t.id AND c.user_id = ?
    ) SELECT 1 AS found FROM tree WHERE id = ? LIMIT 1
  `).get(ancestorId, userId, userId, candidateId) as { found: number } | undefined;
  return Boolean(row);
}

export function updateCollection(userId: number, id: number, input: Partial<{ name: string; parentId: number | null; icon: string | null; color: string | null; sortOrder: number }>): Collection {
  const current = getCollectionRow(userId, id);
  if (!current) throw notFound('分类');
  const parentId = input.parentId === undefined ? current.parentId : input.parentId;
  if (parentId === id || (parentId !== null && isDescendant(userId, parentId, id))) {
    throw new AppError(422, 'INVALID_PARENT', '不能将分类移动到自身或其子分类中');
  }
  assertParentExists(userId, parentId);
  const name = input.name ?? current.name;
  assertSiblingNameAvailable(userId, name, parentId, id);
  getDb().prepare(`UPDATE collections SET name=?, parent_id=?, icon=?, color=?, sort_order=?, updated_at=? WHERE id=? AND user_id=?`).run(
    name, parentId, input.icon === undefined ? current.icon : input.icon,
    input.color === undefined ? current.color : input.color,
    input.sortOrder === undefined ? current.sortOrder : input.sortOrder,
    now(), id, userId,
  );
  const row = getCollectionRow(userId, id);
  if (!row) throw new Error('Collection update failed');
  return { ...row, children: [] };
}

export function deleteCollection(userId: number, id: number): void {
  const current = getCollectionRow(userId, id);
  if (!current) throw notFound('分类');
  inTransaction(() => {
    getDb().prepare('UPDATE bookmarks SET collection_id=NULL, updated_at=? WHERE collection_id=? AND user_id=?').run(now(), id, userId);
    getDb().prepare('UPDATE collections SET parent_id=?, updated_at=? WHERE parent_id=? AND user_id=?').run(current.parentId, now(), id, userId);
    getDb().prepare('DELETE FROM collections WHERE id=? AND user_id=?').run(id, userId);
  });
}

/**
 * 按 orderedIds 顺序重写同一父分类下子分类的 sort_order。
 * 校验：所有 id 必须属于该 parent 且无遗漏、无多余。
 */
export function reorderCollections(userId: number, parentId: number | null, orderedIds: number[]): void {
  const sql = parentId === null
    ? 'SELECT id FROM collections WHERE user_id=? AND parent_id IS NULL'
    : 'SELECT id FROM collections WHERE user_id=? AND parent_id=?';
  const existing = (getDb().prepare(sql).all(userId, ...(parentId === null ? [] : [parentId])) as Array<{ id: number }>).map((r) => r.id);
  const existingSet = new Set(existing);
  if (existing.length !== orderedIds.length) throw new AppError(422, 'INVALID_REORDER', '排序数量与同层分类数量不一致');
  for (const id of orderedIds) {
    if (!existingSet.has(id)) throw new AppError(422, 'INVALID_REORDER', '存在不属于该层的分类 id');
  }
  inTransaction(() => {
    const stmt = getDb().prepare('UPDATE collections SET sort_order=?, updated_at=? WHERE id=? AND user_id=?');
    orderedIds.forEach((id, index) => stmt.run(index, now(), id, userId));
  });
}

export function listTags(userId: number): Tag[] {
  return getDb().prepare(`
    SELECT t.id, t.name, t.color, COUNT(b.id) AS count
    FROM tags t
    LEFT JOIN bookmark_tags bt ON bt.tag_id = t.id
    LEFT JOIN bookmarks b ON b.id = bt.bookmark_id AND b.deleted_at IS NULL AND b.user_id = t.user_id
    WHERE t.user_id = ?
    GROUP BY t.id ORDER BY count DESC, t.name COLLATE NOCASE ASC
  `).all(userId) as Tag[];
}

export function createTag(userId: number, input: { name: string; color?: string | null }): Tag {
  const existing = getDb().prepare('SELECT id FROM tags WHERE user_id=? AND name=?').get(userId, input.name) as { id: number } | undefined;
  if (existing) throw new AppError(409, 'DUPLICATE_NAME', '标签名称已存在');
  const result = getDb().prepare('INSERT INTO tags (user_id, name, color, created_at) VALUES (?, ?, ?, ?)').run(userId, input.name, input.color ?? null, now());
  return { id: Number(result.lastInsertRowid), name: input.name, color: input.color ?? null, count: 0 };
}

export function deleteTag(userId: number, id: number): void {
  const result = getDb().prepare('DELETE FROM tags WHERE id=? AND user_id=?').run(id, userId);
  if (result.changes === 0) throw notFound('标签');
}

function getTagRow(userId: number, id: number): Tag | undefined {
  return getDb().prepare('SELECT id, name, color, 0 AS count FROM tags WHERE id=? AND user_id=?').get(id, userId) as Tag | undefined;
}

export function updateTag(userId: number, id: number, input: Partial<{ name: string; color: string | null }>): Tag {
  const current = getTagRow(userId, id);
  if (!current) throw notFound('标签');
  const name = input.name ?? current.name;
  const color = input.color === undefined ? current.color : input.color;
  const existing = getDb().prepare('SELECT id FROM tags WHERE user_id=? AND name=? AND id<>?').get(userId, name, id) as { id: number } | undefined;
  if (existing) throw new AppError(409, 'DUPLICATE_NAME', '标签名称已存在');
  getDb().prepare('UPDATE tags SET name=?, color=? WHERE id=? AND user_id=?').run(name, color, id, userId);
  return { ...current, name, color };
}

export function mergeTags(userId: number, sourceId: number, targetId: number): { moved: number } {
  if (sourceId === targetId) throw new AppError(422, 'INVALID_MERGE', '不能合并到自身');
  const source = getTagRow(userId, sourceId);
  const target = getTagRow(userId, targetId);
  if (!source || !target) throw notFound('标签');
  const existing = getDb().prepare('SELECT bookmark_id FROM bookmark_tags WHERE tag_id=?').all(sourceId) as Array<{ bookmark_id: number }>;
  getDb().prepare('DELETE FROM bookmark_tags WHERE tag_id=?').run(sourceId);
  let moved = 0;
  for (const { bookmark_id: bookmarkId } of existing) {
    const duplicate = getDb().prepare('SELECT 1 FROM bookmark_tags WHERE bookmark_id=? AND tag_id=?').get(bookmarkId, targetId);
    if (!duplicate) {
      getDb().prepare('INSERT INTO bookmark_tags (bookmark_id, tag_id) VALUES (?, ?)').run(bookmarkId, targetId);
      moved++;
    }
  }
  getDb().prepare('DELETE FROM tags WHERE id=? AND user_id=?').run(sourceId, userId);
  return { moved };
}

export function cleanOrphanTags(userId: number): { deleted: number } {
  const result = getDb().prepare(`
    DELETE FROM tags
    WHERE user_id = ?
      AND id NOT IN (
        SELECT DISTINCT bt.tag_id
        FROM bookmark_tags bt
        JOIN bookmarks b ON b.id = bt.bookmark_id
        WHERE b.user_id = ?
      )
  `).run(userId, userId);
  return { deleted: Number(result.changes) };
}
