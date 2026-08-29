import { db, inTransaction, now } from '../db/index';
import type { Db } from '../db/index';
import { AppError, notFound } from '../lib/errors';
import type { Collection, Tag } from '../types';

type CollectionRow = Omit<Collection, 'children'>;

const COLLECTION_COLUMNS = `
  c.id, c.name, c.parent_id AS "parentId", c.icon, c.color, c.sort_order AS "sortOrder",
  COUNT(b.id) AS "bookmarkCount",
  COALESCE(SUM(b.is_favorite), 0) AS "favoriteCount"
`;

async function getCollectionRow(userId: number, id: number): Promise<CollectionRow | undefined> {
  return db.get<CollectionRow>(`
    SELECT ${COLLECTION_COLUMNS}
    FROM collections c LEFT JOIN bookmarks b ON b.collection_id = c.id AND b.deleted_at IS NULL AND b.user_id = c.user_id
    WHERE c.id = ? AND c.user_id = ? GROUP BY c.id
  `, [id, userId]);
}

async function assertParentExists(userId: number, parentId: number | null): Promise<void> {
  if (parentId !== null && !(await getCollectionRow(userId, parentId))) throw notFound('父分类');
}

async function assertSiblingNameAvailable(userId: number, name: string, parentId: number | null, ignoreId?: number): Promise<void> {
  const sql = parentId === null
    ? 'SELECT id FROM collections WHERE user_id = ? AND parent_id IS NULL AND name = ?'
    : 'SELECT id FROM collections WHERE user_id = ? AND parent_id = ? AND name = ?';
  const params: (string | number)[] = parentId === null ? [userId, name] : [userId, parentId, name];
  const found = await db.get<{ id: number }>(sql, params);
  if (found && found.id !== ignoreId) throw new AppError(409, 'DUPLICATE_NAME', '同级分类中已存在该名称');
}

export async function listCollections(userId: number): Promise<Collection[]> {
  const rows = await db.all<CollectionRow>(`
    SELECT ${COLLECTION_COLUMNS}
    FROM collections c LEFT JOIN bookmarks b ON b.collection_id = c.id AND b.deleted_at IS NULL AND b.user_id = c.user_id
    WHERE c.user_id = ?
    GROUP BY c.id ORDER BY c.sort_order ASC, lower(c.name) ASC
  `, [userId]);

  const byId = new Map<number, Collection>();
  for (const row of rows) byId.set(row.id, { ...row, children: [] });
  const roots: Collection[] = [];
  for (const collection of byId.values()) {
    if (collection.parentId !== null && byId.has(collection.parentId)) byId.get(collection.parentId)!.children.push(collection);
    else roots.push(collection);
  }
  return roots;
}

export async function createCollection(userId: number, input: { name: string; parentId: number | null; icon?: string | null; color?: string | null }): Promise<Collection> {
  await assertParentExists(userId, input.parentId);
  await assertSiblingNameAvailable(userId, input.name, input.parentId);
  const timestamp = now();
  const row = await db.get<{ id: number }>(`
    INSERT INTO collections (user_id, parent_id, name, icon, color, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    RETURNING id
  `, [userId, input.parentId, input.name, input.icon ?? null, input.color ?? null, timestamp, timestamp]);
  const created = await getCollectionRow(userId, row!.id);
  if (!created) throw new Error('Collection creation failed');
  return { ...created, children: [] };
}

async function isDescendant(userId: number, candidateId: number, ancestorId: number): Promise<boolean> {
  const row = await db.get<{ one: number }>(`
    WITH RECURSIVE tree(id) AS (
      SELECT id FROM collections WHERE id = ? AND user_id = ?
      UNION ALL SELECT c.id FROM collections c JOIN tree t ON c.parent_id = t.id AND c.user_id = ?
    ) SELECT 1 AS one FROM tree WHERE id = ? LIMIT 1
  `, [ancestorId, userId, userId, candidateId]);
  return Boolean(row);
}

export async function updateCollection(userId: number, id: number, input: Partial<{ name: string; parentId: number | null; icon: string | null; color: string | null; sortOrder: number }>): Promise<Collection> {
  const current = await getCollectionRow(userId, id);
  if (!current) throw notFound('分类');
  const parentId = input.parentId === undefined ? current.parentId : input.parentId;
  if (parentId === id || (parentId !== null && (await isDescendant(userId, parentId, id)))) {
    throw new AppError(422, 'INVALID_PARENT', '不能将分类移动到自身或其子分类中');
  }
  await assertParentExists(userId, parentId);
  const name = input.name ?? current.name;
  await assertSiblingNameAvailable(userId, name, parentId, id);
  await db.run(`UPDATE collections SET name=?, parent_id=?, icon=?, color=?, sort_order=?, updated_at=? WHERE id=? AND user_id=?`, [
    name, parentId,
    input.icon === undefined ? current.icon : input.icon,
    input.color === undefined ? current.color : input.color,
    input.sortOrder === undefined ? current.sortOrder : input.sortOrder,
    now(), id, userId,
  ]);
  const row = await getCollectionRow(userId, id);
  if (!row) throw new Error('Collection update failed');
  return { ...row, children: [] };
}

export async function deleteCollection(userId: number, id: number): Promise<void> {
  const current = await getCollectionRow(userId, id);
  if (!current) throw notFound('分类');
  await inTransaction(async (tx) => {
    await tx.run('UPDATE bookmarks SET collection_id=NULL, updated_at=? WHERE collection_id=? AND user_id=?', [now(), id, userId]);
    await tx.run('UPDATE collections SET parent_id=?, updated_at=? WHERE parent_id=? AND user_id=?', [current.parentId, now(), id, userId]);
    await tx.run('DELETE FROM collections WHERE id=? AND user_id=?', [id, userId]);
  });
}

/**
 * 按 orderedIds 顺序重写同一父分类下子分类的 sort_order。
 * 校验：所有 id 必须属于该 parent 且无遗漏、无多余。
 */
export async function reorderCollections(userId: number, parentId: number | null, orderedIds: number[]): Promise<void> {
  const sql = parentId === null
    ? 'SELECT id FROM collections WHERE user_id=? AND parent_id IS NULL'
    : 'SELECT id FROM collections WHERE user_id=? AND parent_id=?';
  const existing = (await db.all<{ id: number }>(sql, parentId === null ? [userId] : [userId, parentId])).map((r) => r.id);
  const existingSet = new Set(existing);
  if (existing.length !== orderedIds.length) throw new AppError(422, 'INVALID_REORDER', '排序数量与同层分类数量不一致');
  for (const id of orderedIds) {
    if (!existingSet.has(id)) throw new AppError(422, 'INVALID_REORDER', '存在不属于该层的分类 id');
  }
  await inTransaction(async (tx) => {
    for (const [index, id] of orderedIds.entries()) {
      await tx.run('UPDATE collections SET sort_order=?, updated_at=? WHERE id=? AND user_id=?', [index, now(), id, userId]);
    }
  });
}

export async function listTags(userId: number): Promise<Tag[]> {
  return db.all<Tag>(`
    SELECT t.id, t.name, t.color, COUNT(b.id) AS count
    FROM tags t
    LEFT JOIN bookmark_tags bt ON bt.tag_id = t.id
    LEFT JOIN bookmarks b ON b.id = bt.bookmark_id AND b.deleted_at IS NULL AND b.user_id = t.user_id
    WHERE t.user_id = ?
    GROUP BY t.id ORDER BY count DESC, lower(t.name) ASC
  `, [userId]);
}

export async function createTag(userId: number, input: { name: string; color?: string | null }): Promise<Tag> {
  const existing = await db.get<{ id: number }>('SELECT id FROM tags WHERE user_id=? AND name=?', [userId, input.name]);
  if (existing) throw new AppError(409, 'DUPLICATE_NAME', '标签名称已存在');
  const row = await db.get<{ id: number }>('INSERT INTO tags (user_id, name, color, created_at) VALUES (?, ?, ?, ?) RETURNING id', [userId, input.name, input.color ?? null, now()]);
  return { id: row!.id, name: input.name, color: input.color ?? null, count: 0 };
}

export async function deleteTag(userId: number, id: number): Promise<void> {
  const result = await db.run('DELETE FROM tags WHERE id=? AND user_id=?', [id, userId]);
  if (result.changes === 0) throw notFound('标签');
}

async function getTagRow(userId: number, id: number): Promise<Tag | undefined> {
  return db.get<Tag>('SELECT id, name, color, 0 AS count FROM tags WHERE id=? AND user_id=?', [id, userId]);
}

export async function updateTag(userId: number, id: number, input: Partial<{ name: string; color: string | null }>): Promise<Tag> {
  const current = await getTagRow(userId, id);
  if (!current) throw notFound('标签');
  const name = input.name ?? current.name;
  const color = input.color === undefined ? current.color : input.color;
  const existing = await db.get<{ id: number }>('SELECT id FROM tags WHERE user_id=? AND name=? AND id<>?', [userId, name, id]);
  if (existing) throw new AppError(409, 'DUPLICATE_NAME', '标签名称已存在');
  await db.run('UPDATE tags SET name=?, color=? WHERE id=? AND user_id=?', [name, color, id, userId]);
  return { ...current, name, color };
}

export async function mergeTags(userId: number, sourceId: number, targetId: number): Promise<{ moved: number }> {
  if (sourceId === targetId) throw new AppError(422, 'INVALID_MERGE', '不能合并到自身');
  const source = await getTagRow(userId, sourceId);
  const target = await getTagRow(userId, targetId);
  if (!source || !target) throw notFound('标签');
  return inTransaction(async (tx) => mergeTagsInTx(tx, userId, sourceId, targetId));
}

async function mergeTagsInTx(tx: Db, userId: number, sourceId: number, targetId: number): Promise<{ moved: number }> {
  const existing = await tx.all<{ bookmark_id: number }>('SELECT bookmark_id FROM bookmark_tags WHERE tag_id=?', [sourceId]);
  await tx.run('DELETE FROM bookmark_tags WHERE tag_id=?', [sourceId]);
  let moved = 0;
  for (const { bookmark_id: bookmarkId } of existing) {
    const duplicate = await tx.get<{ one: number }>('SELECT 1 AS one FROM bookmark_tags WHERE bookmark_id=? AND tag_id=?', [bookmarkId, targetId]);
    if (!duplicate) {
      await tx.run('INSERT INTO bookmark_tags (bookmark_id, tag_id) VALUES (?, ?)', [bookmarkId, targetId]);
      moved++;
    }
  }
  await tx.run('DELETE FROM tags WHERE id=? AND user_id=?', [sourceId, userId]);
  return { moved };
}

export async function cleanOrphanTags(userId: number): Promise<{ deleted: number }> {
  const result = await db.run(`
    DELETE FROM tags
    WHERE user_id = ?
      AND id NOT IN (
        SELECT DISTINCT bt.tag_id
        FROM bookmark_tags bt
        JOIN bookmarks b ON b.id = bt.bookmark_id
        WHERE b.user_id = ?
      )
  `, [userId, userId]);
  return { deleted: result.changes };
}
