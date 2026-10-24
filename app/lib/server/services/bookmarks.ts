import { db, inTransaction, now } from '../db/index';
import type { Db } from '../db/index';
import { AppError, notFound } from '../lib/errors';
import { faviconFor, normalizeUrl, titleFallback } from '../lib/url';
import type { Bookmark } from '../types';

type BookmarkRow = Omit<Bookmark, 'tags' | 'categoryPath'> & { isFavorite: number | boolean };
type BookmarkInput = {
  url: string;
  title?: string;
  description?: string | null;
  note?: string | null;
  collectionId?: number | null;
  coverUrl?: string | null;
  tags?: string[];
  isFavorite?: boolean;
};
type BookmarkFilters = {
  q?: string;
  collectionId?: number | 'none';
  tag?: string;
  favorite?: 'true' | 'false';
  direct?: 'true' | 'false';
  all?: 'true';
  sort: 'newest' | 'oldest' | 'title' | 'popular';
  page: number;
  pageSize: number;
};

// PostgreSQL 会把不带引号的别名折叠为小写,JS 侧读取 camelCase 键会得到 undefined,
// 因此所有 camelCase 别名必须用双引号包裹。
const BOOKMARK_COLUMNS = `
  b.id, b.url, b.title, b.description, b.note, b.favicon_url AS "faviconUrl",
  b.cover_url AS "coverUrl", b.is_favorite AS "isFavorite", b.click_count AS "clickCount",
  b.last_visited_at AS "lastVisitedAt", b.collection_id AS "collectionId", c.name AS "collectionName",
  b.created_at AS "createdAt", b.updated_at AS "updatedAt"
`;

function toBookmark(row: BookmarkRow, tags: string[] = [], categoryPath: string[] = []): Bookmark {
  return { ...row, isFavorite: Boolean(row.isFavorite), tags, categoryPath };
}

async function assertCollectionExists(userId: number, collectionId: number | null | undefined): Promise<void> {
  if (collectionId === null || collectionId === undefined) return;
  const found = await db.get<{ one: number }>('SELECT 1 AS one FROM collections WHERE id=? AND user_id=?', [collectionId, userId]);
  if (!found) throw notFound('分类');
}

function normalizedTags(tags: string[]): string[] {
  return [...new Set(tags.map((tag) => tag.trim()).filter(Boolean))];
}

/** all 模式(免分页)的单次返回上限,防止超大书签库拖垮响应 */
const MAX_LIST_ITEMS = 5_000;

/** LIKE/ILIKE 通配符转义:用户输入中的 % _ \ 按字面量匹配(PG 默认转义符为反斜杠)。 */
function escapeLikeTerm(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

/** 必须在事务内调用(tx 为当前事务连接)。 */
export async function syncBookmarkTags(tx: Db, userId: number, bookmarkId: number, inputTags: string[]): Promise<void> {
  const tags = normalizedTags(inputTags);
  await tx.run('DELETE FROM bookmark_tags WHERE bookmark_id=?', [bookmarkId]);
  for (const tag of tags) {
    await tx.run('INSERT INTO tags (user_id, name, created_at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING', [userId, tag, now()]);
    const tagRow = await tx.get<{ id: number }>('SELECT id FROM tags WHERE user_id=? AND name=?', [userId, tag]);
    if (tagRow) {
      await tx.run('INSERT INTO bookmark_tags (bookmark_id, tag_id) VALUES (?, ?) ON CONFLICT DO NOTHING', [bookmarkId, tagRow.id]);
    }
  }
}

async function getTagsForBookmarkIds(ids: number[]): Promise<Map<number, string[]>> {
  const tags = new Map<number, string[]>();
  if (ids.length === 0) return tags;
  const placeholders = ids.map(() => '?').join(',');
  const rows = await db.all<{ bookmarkId: number; name: string }>(`
    SELECT bt.bookmark_id AS "bookmarkId", t.name
    FROM bookmark_tags bt JOIN tags t ON t.id=bt.tag_id
    WHERE bt.bookmark_id IN (${placeholders}) ORDER BY lower(t.name)
  `, ids);
  for (const row of rows) {
    const entry = tags.get(row.bookmarkId) ?? [];
    entry.push(row.name);
    tags.set(row.bookmarkId, entry);
  }
  return tags;
}

async function getCategoryPaths(userId: number, collectionIds: number[]): Promise<Map<number, string[]>> {
  const paths = new Map<number, string[]>();
  const ids = [...new Set(collectionIds)];
  if (ids.length === 0) return paths;
  const placeholders = ids.map(() => '?').join(',');
  const rows = await db.all<{ originId: number; name: string; depth: number }>(`
    WITH RECURSIVE ancestors(originId, id, parentId, name, depth) AS (
      SELECT id, id, parent_id, name, 0 FROM collections WHERE id IN (${placeholders}) AND user_id = ?
      UNION ALL
      SELECT a.originId, c.id, c.parent_id, c.name, a.depth + 1
      FROM ancestors a JOIN collections c ON c.id = a.parentId AND c.user_id = ?
    )
    SELECT originId AS "originId", name, depth FROM ancestors ORDER BY originId, depth DESC
  `, [...ids, userId, userId]);
  for (const row of rows) {
    const path = paths.get(row.originId) ?? [];
    path.push(row.name);
    paths.set(row.originId, path);
  }
  return paths;
}

async function getRawBookmark(userId: number, id: number): Promise<BookmarkRow | undefined> {
  return db.get<BookmarkRow>(`
    SELECT ${BOOKMARK_COLUMNS}
    FROM bookmarks b LEFT JOIN collections c ON c.id=b.collection_id AND c.user_id=b.user_id
    WHERE b.id=? AND b.user_id=? AND b.deleted_at IS NULL
  `, [id, userId]);
}

export async function getBookmark(userId: number, id: number): Promise<Bookmark> {
  const row = await getRawBookmark(userId, id);
  if (!row) throw notFound('书签');
  const tags = (await getTagsForBookmarkIds([id])).get(id) ?? [];
  const categoryPath = row.collectionId === null ? [] : ((await getCategoryPaths(userId, [row.collectionId])).get(row.collectionId) ?? []);
  return toBookmark(row, tags, categoryPath);
}

export async function createBookmark(userId: number, input: BookmarkInput): Promise<Bookmark> {
  const url = normalizeUrl(input.url);
  // 查重须覆盖回收站行:UNIQUE(user_id, url) 不区分 deleted_at,
  // 只查未删行的话,命中回收站同 URL 行的 INSERT 会以 23505 变成 500。
  const existing = await db.get<{ id: number; deletedAt: string | null }>('SELECT id, deleted_at AS "deletedAt" FROM bookmarks WHERE user_id=? AND url=?', [userId, url]);
  if (existing) {
    throw new AppError(409, 'DUPLICATE_URL', existing.deletedAt ? '该网址已在回收站中，可先还原或彻底删除后再添加' : '该网址已收藏', { id: existing.id });
  }
  await assertCollectionExists(userId, input.collectionId);
  const title = input.title?.trim() || titleFallback(url);
  const timestamp = now();
  const id = await inTransaction(async (tx) => {
    const row = await tx.get<{ id: number }>(`
      INSERT INTO bookmarks (user_id, collection_id, url, title, description, note, favicon_url, cover_url, is_favorite, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING id
    `, [userId, input.collectionId ?? null, url, title, input.description ?? null, input.note ?? null, faviconFor(url), input.coverUrl ?? null, input.isFavorite ? 1 : 0, timestamp, timestamp]);
    const bookmarkId = row!.id;
    await syncBookmarkTags(tx, userId, bookmarkId, input.tags ?? []);
    return bookmarkId;
  });
  return getBookmark(userId, id);
}

export async function updateBookmark(userId: number, id: number, input: Partial<BookmarkInput>): Promise<Bookmark> {
  const current = await getRawBookmark(userId, id);
  if (!current) throw notFound('书签');
  const url = input.url === undefined ? current.url : normalizeUrl(input.url);
  if (url !== current.url) {
    const duplicate = await db.get<{ id: number; deletedAt: string | null }>('SELECT id, deleted_at AS "deletedAt" FROM bookmarks WHERE user_id=? AND url=? AND id<>?', [userId, url, id]);
    if (duplicate) {
      throw new AppError(409, 'DUPLICATE_URL', duplicate.deletedAt ? '该网址已在回收站中，可先还原或彻底删除后再添加' : '该网址已收藏', { id: duplicate.id });
    }
  }
  const collectionId = input.collectionId === undefined ? current.collectionId : input.collectionId;
  await assertCollectionExists(userId, collectionId);
  await inTransaction(async (tx) => {
    await tx.run(`
      UPDATE bookmarks SET url=?, title=?, description=?, note=?, collection_id=?, favicon_url=?, cover_url=?, is_favorite=?, updated_at=?
      WHERE id=? AND user_id=?
    `, [
      url,
      input.title === undefined ? current.title : (input.title.trim() || titleFallback(url)),
      input.description === undefined ? current.description : input.description,
      input.note === undefined ? current.note : input.note,
      collectionId ?? null,
      url === current.url ? current.faviconUrl : faviconFor(url),
      input.coverUrl === undefined ? current.coverUrl : input.coverUrl,
      input.isFavorite === undefined ? (current.isFavorite ? 1 : 0) : (input.isFavorite ? 1 : 0),
      now(), id, userId,
    ]);
    if (input.tags !== undefined) await syncBookmarkTags(tx, userId, id, input.tags);
  });
  return getBookmark(userId, id);
}

export async function deleteBookmark(userId: number, id: number): Promise<void> {
  const result = await db.run('UPDATE bookmarks SET deleted_at=?, updated_at=? WHERE id=? AND user_id=? AND deleted_at IS NULL', [now(), now(), id, userId]);
  if (result.changes === 0) throw notFound('书签');
}

export async function listTrashedBookmarks(userId: number): Promise<Array<Bookmark & { deletedAt: string }>> {
  const rows = await db.all<BookmarkRow & { deletedAt: string }>(`
    SELECT ${BOOKMARK_COLUMNS}, b.deleted_at AS "deletedAt"
    FROM bookmarks b LEFT JOIN collections c ON c.id=b.collection_id AND c.user_id=b.user_id
    WHERE b.user_id=? AND b.deleted_at IS NOT NULL
    ORDER BY b.deleted_at DESC
  `, [userId]);
  const tags = await getTagsForBookmarkIds(rows.map((row) => row.id));
  const categoryPaths = await getCategoryPaths(userId, rows.flatMap((row) => row.collectionId === null ? [] : [row.collectionId]));
  return rows.map((row) => ({
    ...toBookmark(row, tags.get(row.id) ?? [], row.collectionId === null ? [] : (categoryPaths.get(row.collectionId) ?? [])),
    deletedAt: row.deletedAt,
  }));
}

export async function restoreBookmark(userId: number, id: number): Promise<Bookmark> {
  const result = await db.run('UPDATE bookmarks SET deleted_at=NULL, updated_at=? WHERE id=? AND user_id=? AND deleted_at IS NOT NULL', [now(), id, userId]);
  if (result.changes === 0) throw notFound('书签');
  return getBookmark(userId, id);
}

export async function permanentlyDeleteBookmark(userId: number, id: number): Promise<void> {
  const result = await db.run('DELETE FROM bookmarks WHERE id=? AND user_id=? AND deleted_at IS NOT NULL', [id, userId]);
  if (result.changes === 0) throw notFound('书签');
}

export async function emptyTrash(userId: number): Promise<{ deleted: number }> {
  const result = await db.run('DELETE FROM bookmarks WHERE user_id=? AND deleted_at IS NOT NULL', [userId]);
  return { deleted: result.changes };
}

export async function purgeExpiredTrash(userId: number, days = 30): Promise<{ deleted: number }> {
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
  const result = await db.run('DELETE FROM bookmarks WHERE user_id=? AND deleted_at IS NOT NULL AND deleted_at < ?', [userId, cutoff]);
  return { deleted: result.changes };
}

async function descendantIds(userId: number, collectionId: number): Promise<number[]> {
  const rows = await db.all<{ id: number }>(`
    WITH RECURSIVE tree(id) AS (
      SELECT id FROM collections WHERE id=? AND user_id=?
      UNION ALL SELECT c.id FROM collections c JOIN tree t ON c.parent_id=t.id AND c.user_id=?
    ) SELECT id FROM tree
  `, [collectionId, userId, userId]);
  if (rows.length === 0) throw notFound('分类');
  return rows.map((row) => row.id);
}

export async function listBookmarks(userId: number, filters: BookmarkFilters): Promise<{ items: Bookmark[]; total: number; page: number; pageSize: number }> {
  const conditions = ['b.user_id = ?', 'b.deleted_at IS NULL'];
  const params: (string | number)[] = [userId];
  if (filters.q) {
    // PG 的 LIKE 区分大小写(SQLite 默认不区分),改用 ILIKE 保持搜索行为一致
    conditions.push(`(b.title ILIKE ? OR b.url ILIKE ? OR COALESCE(b.description, '') ILIKE ? OR COALESCE(b.note, '') ILIKE ?)`);
    const value = `%${escapeLikeTerm(filters.q)}%`;
    params.push(value, value, value, value);
  }
  const browseDirect = filters.direct === 'true';
  if (filters.collectionId === 'none') conditions.push('b.collection_id IS NULL');
  else if (typeof filters.collectionId === 'number') {
    if (browseDirect) {
      await assertCollectionExists(userId, filters.collectionId);
      conditions.push('b.collection_id = ?');
      params.push(filters.collectionId);
    } else {
      const ids = await descendantIds(userId, filters.collectionId);
      conditions.push(`b.collection_id IN (${ids.map(() => '?').join(',')})`);
      params.push(...ids);
    }
  }
  if (filters.tag) {
    conditions.push('EXISTS (SELECT 1 FROM bookmark_tags bt JOIN tags t ON t.id=bt.tag_id WHERE bt.bookmark_id=b.id AND t.name=? AND t.user_id=?)');
    params.push(filters.tag, userId);
  }
  if (filters.favorite) {
    conditions.push('b.is_favorite=?');
    params.push(filters.favorite === 'true' ? 1 : 0);
  }
  const where = `WHERE ${conditions.join(' AND ')}`;
  const orderBy: Record<BookmarkFilters['sort'], string> = {
    newest: 'b.created_at DESC', oldest: 'b.created_at ASC', title: 'lower(b.title) ASC', popular: 'b.click_count DESC, b.created_at DESC',
  };
  const total = (await db.get<{ count: number }>(`SELECT COUNT(*) AS count FROM bookmarks b ${where}`, params))!.count;
  // all 模式(浏览视图整树渲染)跳过分页,但保留硬上限:
  // 响应还会携带每条书签的标签与分类路径,无上限的全量返回会拖垮内存与 IN 子句查询
  const fetchAll = filters.all === 'true';
  const limitClause = fetchAll ? ` LIMIT ${MAX_LIST_ITEMS}` : ' LIMIT ? OFFSET ?';
  if (!fetchAll) params.push(filters.pageSize, (filters.page - 1) * filters.pageSize);
  const rows = await db.all<BookmarkRow>(`
    SELECT ${BOOKMARK_COLUMNS}
    FROM bookmarks b LEFT JOIN collections c ON c.id=b.collection_id AND c.user_id=b.user_id ${where}
    ORDER BY ${orderBy[filters.sort]}${limitClause}
  `, params);
  const tags = await getTagsForBookmarkIds(rows.map((row) => row.id));
  const categoryPaths = await getCategoryPaths(userId, rows.flatMap((row) => row.collectionId === null ? [] : [row.collectionId]));
  return {
    items: rows.map((row) => toBookmark(row, tags.get(row.id) ?? [], row.collectionId === null ? [] : (categoryPaths.get(row.collectionId) ?? []))),
    total, page: fetchAll ? 1 : filters.page, pageSize: fetchAll ? total : filters.pageSize,
  };
}

export async function visitBookmark(userId: number, id: number): Promise<number> {
  const row = await db.get<{ clickCount: number }>(`
    UPDATE bookmarks SET click_count=click_count+1, last_visited_at=?, updated_at=?
    WHERE id=? AND user_id=? AND deleted_at IS NULL
    RETURNING click_count AS "clickCount"
  `, [now(), now(), id, userId]);
  if (!row) throw notFound('书签');
  return row.clickCount;
}

export async function getStats(userId: number): Promise<{ bookmarks: number; collections: number; tags: number; uncategorized: number; favorites: number; trashed: number }> {
  const count = (sql: string) => db.get<{ count: number }>(sql, [userId]).then((row) => row!.count);
  const [bookmarks, collections, tags, uncategorized, favorites, trashed] = await Promise.all([
    count('SELECT COUNT(*) AS count FROM bookmarks WHERE user_id=? AND deleted_at IS NULL'),
    count('SELECT COUNT(*) AS count FROM collections WHERE user_id=?'),
    count('SELECT COUNT(*) AS count FROM tags WHERE user_id=?'),
    count('SELECT COUNT(*) AS count FROM bookmarks WHERE user_id=? AND deleted_at IS NULL AND collection_id IS NULL'),
    count('SELECT COUNT(*) AS count FROM bookmarks WHERE user_id=? AND deleted_at IS NULL AND is_favorite=1'),
    count('SELECT COUNT(*) AS count FROM bookmarks WHERE user_id=? AND deleted_at IS NOT NULL'),
  ]);
  return { bookmarks, collections, tags, uncategorized, favorites, trashed };
}

export async function batchMoveBookmarks(userId: number, ids: number[], collectionId: number | null): Promise<{ updated: number }> {
  await assertCollectionExists(userId, collectionId);
  if (ids.length === 0) return { updated: 0 };
  const placeholders = ids.map(() => '?').join(',');
  const result = await db.run(`UPDATE bookmarks SET collection_id=?, updated_at=? WHERE id IN (${placeholders}) AND user_id=? AND deleted_at IS NULL`, [collectionId ?? null, now(), ...ids, userId]);
  return { updated: result.changes };
}

export async function batchAddTags(userId: number, ids: number[], inputTags: string[]): Promise<{ tagsCreated: number }> {
  const tags = normalizedTags(inputTags);
  if (tags.length === 0 || ids.length === 0) return { tagsCreated: 0 };
  const timestamp = now();

  // 整体包事务:中途失败时全部回滚,不留「打了半个标签」的半更新状态
  return inTransaction(async (tx) => {
    // 确保只为属于该 userId 的书签打标签
    const placeholders = ids.map(() => '?').join(',');
    const validBookmarks = (await tx.all<{ id: number }>(`SELECT id FROM bookmarks WHERE id IN (${placeholders}) AND user_id=? AND deleted_at IS NULL`, [...ids, userId])).map((b) => b.id);
    if (validBookmarks.length === 0) return { tagsCreated: 0 };
    const bookmarkPlaceholders = validBookmarks.map(() => '?').join(',');

    let tagsCreated = 0;
    for (const tag of tags) {
      await tx.run('INSERT INTO tags (user_id, name, created_at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING', [userId, tag, timestamp]);
      const row = await tx.get<{ id: number }>('SELECT id FROM tags WHERE user_id=? AND name=?', [userId, tag]);
      if (row) {
        // 每个标签一条 INSERT...SELECT,替代原先 tag×bookmark 的双层逐条循环
        await tx.run(
          `INSERT INTO bookmark_tags (bookmark_id, tag_id)
           SELECT id, ? FROM bookmarks WHERE id IN (${bookmarkPlaceholders})
           ON CONFLICT DO NOTHING`,
          [row.id, ...validBookmarks],
        );
        tagsCreated++;
      }
    }
    return { tagsCreated };
  });
}

export async function batchDeleteBookmarks(userId: number, ids: number[]): Promise<{ updated: number }> {
  if (ids.length === 0) return { updated: 0 };
  const timestamp = now();
  const placeholders = ids.map(() => '?').join(',');
  const result = await db.run(`UPDATE bookmarks SET deleted_at=?, updated_at=? WHERE id IN (${placeholders}) AND user_id=? AND deleted_at IS NULL`, [timestamp, timestamp, ...ids, userId]);
  return { updated: result.changes };
}
