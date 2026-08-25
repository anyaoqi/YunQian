import { getDb, inTransaction, now } from '../db/index';
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

function toBookmark(row: BookmarkRow, tags: string[] = [], categoryPath: string[] = []): Bookmark {
  return { ...row, isFavorite: Boolean(row.isFavorite), tags, categoryPath };
}

function assertCollectionExists(userId: number, collectionId: number | null | undefined): void {
  if (collectionId === null || collectionId === undefined) return;
  const found = getDb().prepare('SELECT 1 FROM collections WHERE id=? AND user_id=?').get(collectionId, userId);
  if (!found) throw notFound('分类');
}

function normalizedTags(tags: string[]): string[] {
  return [...new Set(tags.map((tag) => tag.trim()).filter(Boolean))];
}

export function syncBookmarkTags(userId: number, bookmarkId: number, inputTags: string[]): void {
  const tags = normalizedTags(inputTags);
  getDb().prepare('DELETE FROM bookmark_tags WHERE bookmark_id=?').run(bookmarkId);
  const addTag = getDb().prepare('INSERT OR IGNORE INTO tags (user_id, name, created_at) VALUES (?, ?, ?)');
  const findTag = getDb().prepare('SELECT id FROM tags WHERE user_id=? AND name=?');
  const link = getDb().prepare('INSERT OR IGNORE INTO bookmark_tags (bookmark_id, tag_id) VALUES (?, ?)');
  for (const tag of tags) {
    addTag.run(userId, tag, now());
    const tagRow = findTag.get(userId, tag) as { id: number } | undefined;
    if (tagRow) {
      link.run(bookmarkId, tagRow.id);
    }
  }
}

function getTagsForBookmarkIds(ids: number[]): Map<number, string[]> {
  const tags = new Map<number, string[]>();
  if (ids.length === 0) return tags;
  const placeholders = ids.map(() => '?').join(',');
  const rows = getDb().prepare(`
    SELECT bt.bookmark_id AS bookmarkId, t.name
    FROM bookmark_tags bt JOIN tags t ON t.id=bt.tag_id
    WHERE bt.bookmark_id IN (${placeholders}) ORDER BY t.name COLLATE NOCASE
  `).all(...ids) as Array<{ bookmarkId: number; name: string }>;
  for (const row of rows) {
    const entry = tags.get(row.bookmarkId) ?? [];
    entry.push(row.name);
    tags.set(row.bookmarkId, entry);
  }
  return tags;
}

function getCategoryPaths(userId: number, collectionIds: number[]): Map<number, string[]> {
  const paths = new Map<number, string[]>();
  const ids = [...new Set(collectionIds)];
  if (ids.length === 0) return paths;
  const placeholders = ids.map(() => '?').join(',');
  const rows = getDb().prepare(`
    WITH RECURSIVE ancestors(originId, id, parentId, name, depth) AS (
      SELECT id, id, parent_id, name, 0 FROM collections WHERE id IN (${placeholders}) AND user_id = ?
      UNION ALL
      SELECT a.originId, c.id, c.parent_id, c.name, a.depth + 1
      FROM ancestors a JOIN collections c ON c.id = a.parentId AND c.user_id = ?
    )
    SELECT originId, name, depth FROM ancestors ORDER BY originId, depth DESC
  `).all(userId, userId, ...ids) as Array<{ originId: number; name: string; depth: number }>;
  for (const row of rows) {
    const path = paths.get(row.originId) ?? [];
    path.push(row.name);
    paths.set(row.originId, path);
  }
  return paths;
}

function getRawBookmark(userId: number, id: number): BookmarkRow | undefined {
  return getDb().prepare(`
    SELECT b.id, b.url, b.title, b.description, b.note, b.favicon_url AS faviconUrl,
      b.cover_url AS coverUrl, b.is_favorite AS isFavorite, b.click_count AS clickCount,
      b.last_visited_at AS lastVisitedAt, b.collection_id AS collectionId, c.name AS collectionName,
      b.created_at AS createdAt, b.updated_at AS updatedAt
    FROM bookmarks b LEFT JOIN collections c ON c.id=b.collection_id AND c.user_id=b.user_id
    WHERE b.id=? AND b.user_id=? AND b.deleted_at IS NULL
  `).get(id, userId) as BookmarkRow | undefined;
}

export function getBookmark(userId: number, id: number): Bookmark {
  const row = getRawBookmark(userId, id);
  if (!row) throw notFound('书签');
  const tags = getTagsForBookmarkIds([id]).get(id) ?? [];
  const categoryPath = row.collectionId === null ? [] : (getCategoryPaths(userId, [row.collectionId]).get(row.collectionId) ?? []);
  return toBookmark(row, tags, categoryPath);
}

export function createBookmark(userId: number, input: BookmarkInput): Bookmark {
  const url = normalizeUrl(input.url);
  const existing = getDb().prepare('SELECT id FROM bookmarks WHERE user_id=? AND url=?').get(userId, url) as { id: number } | undefined;
  if (existing) throw new AppError(409, 'DUPLICATE_URL', '该网址已收藏', { id: existing.id });
  assertCollectionExists(userId, input.collectionId);
  const title = input.title?.trim() || titleFallback(url);
  const timestamp = now();
  const id = inTransaction(() => {
    const result = getDb().prepare(`
      INSERT INTO bookmarks (user_id, collection_id, url, title, description, note, favicon_url, cover_url, is_favorite, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(userId, input.collectionId ?? null, url, title, input.description ?? null, input.note ?? null, faviconFor(url), input.coverUrl ?? null, input.isFavorite ? 1 : 0, timestamp, timestamp);
    const bookmarkId = Number(result.lastInsertRowid);
    syncBookmarkTags(userId, bookmarkId, input.tags ?? []);
    return bookmarkId;
  });
  return getBookmark(userId, id);
}

export function updateBookmark(userId: number, id: number, input: Partial<BookmarkInput>): Bookmark {
  const current = getRawBookmark(userId, id);
  if (!current) throw notFound('书签');
  const url = input.url === undefined ? current.url : normalizeUrl(input.url);
  if (url !== current.url) {
    const duplicate = getDb().prepare('SELECT id FROM bookmarks WHERE user_id=? AND url=? AND id<>?').get(userId, url, id) as { id: number } | undefined;
    if (duplicate) throw new AppError(409, 'DUPLICATE_URL', '该网址已收藏', { id: duplicate.id });
  }
  const collectionId = input.collectionId === undefined ? current.collectionId : input.collectionId;
  assertCollectionExists(userId, collectionId);
  inTransaction(() => {
    getDb().prepare(`
      UPDATE bookmarks SET url=?, title=?, description=?, note=?, collection_id=?, favicon_url=?, cover_url=?, is_favorite=?, updated_at=?
      WHERE id=? AND user_id=?
    `).run(
      url,
      input.title === undefined ? current.title : (input.title.trim() || titleFallback(url)),
      input.description === undefined ? current.description : input.description,
      input.note === undefined ? current.note : input.note,
      collectionId ?? null,
      url === current.url ? current.faviconUrl : faviconFor(url),
      input.coverUrl === undefined ? current.coverUrl : input.coverUrl,
      input.isFavorite === undefined ? (current.isFavorite ? 1 : 0) : (input.isFavorite ? 1 : 0),
      now(), id, userId,
    );
    if (input.tags !== undefined) syncBookmarkTags(userId, id, input.tags);
  });
  return getBookmark(userId, id);
}

export function deleteBookmark(userId: number, id: number): void {
  const result = getDb().prepare('UPDATE bookmarks SET deleted_at=?, updated_at=? WHERE id=? AND user_id=? AND deleted_at IS NULL').run(now(), now(), id, userId);
  if (result.changes === 0) throw notFound('书签');
}

export function listTrashedBookmarks(userId: number): Bookmark[] {
  const rows = getDb().prepare(`
    SELECT b.id, b.url, b.title, b.description, b.note, b.favicon_url AS faviconUrl,
      b.cover_url AS coverUrl, b.is_favorite AS isFavorite, b.click_count AS clickCount,
      b.last_visited_at AS lastVisitedAt, b.collection_id AS collectionId, c.name AS collectionName,
      b.created_at AS createdAt, b.updated_at AS updatedAt, b.deleted_at AS deletedAt
    FROM bookmarks b LEFT JOIN collections c ON c.id=b.collection_id AND c.user_id=b.user_id
    WHERE b.user_id=? AND b.deleted_at IS NOT NULL
    ORDER BY b.deleted_at DESC
  `).all(userId) as (BookmarkRow & { deletedAt: string })[];
  const tags = getTagsForBookmarkIds(rows.map((row) => row.id));
  const categoryPaths = getCategoryPaths(userId, rows.flatMap((row) => row.collectionId === null ? [] : [row.collectionId]));
  return rows.map((row) => {
    const { deletedAt, ...rest } = row;
    return { ...toBookmark(rest, tags.get(row.id) ?? [], row.collectionId === null ? [] : (categoryPaths.get(row.collectionId) ?? [])), deletedAt };
  });
}

export function restoreBookmark(userId: number, id: number): Bookmark {
  const result = getDb().prepare('UPDATE bookmarks SET deleted_at=NULL, updated_at=? WHERE id=? AND user_id=? AND deleted_at IS NOT NULL').run(now(), id, userId);
  if (result.changes === 0) throw notFound('书签');
  return getBookmark(userId, id);
}

export function permanentlyDeleteBookmark(userId: number, id: number): void {
  const result = getDb().prepare('DELETE FROM bookmarks WHERE id=? AND user_id=? AND deleted_at IS NOT NULL').run(id, userId);
  if (result.changes === 0) throw notFound('书签');
}

export function emptyTrash(userId: number): { deleted: number } {
  const result = getDb().prepare('DELETE FROM bookmarks WHERE user_id=? AND deleted_at IS NOT NULL').run(userId);
  return { deleted: Number(result.changes) };
}

export function purgeExpiredTrash(userId: number, days = 30): { deleted: number } {
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
  const result = getDb().prepare('DELETE FROM bookmarks WHERE user_id=? AND deleted_at IS NOT NULL AND deleted_at < ?').run(userId, cutoff);
  return { deleted: Number(result.changes) };
}

function descendantIds(userId: number, collectionId: number): number[] {
  const rows = getDb().prepare(`
    WITH RECURSIVE tree(id) AS (
      SELECT id FROM collections WHERE id=? AND user_id=?
      UNION ALL SELECT c.id FROM collections c JOIN tree t ON c.parent_id=t.id AND c.user_id=?
    ) SELECT id FROM tree
  `).all(collectionId, userId, userId) as Array<{ id: number }>;
  if (rows.length === 0) throw notFound('分类');
  return rows.map((row) => row.id);
}

export function listBookmarks(userId: number, filters: BookmarkFilters): { items: Bookmark[]; total: number; page: number; pageSize: number } {
  const conditions = ['b.user_id = ?', 'b.deleted_at IS NULL'];
  const params: (string | number)[] = [userId];
  if (filters.q) {
    conditions.push('(b.title LIKE ? OR b.url LIKE ? OR COALESCE(b.description, \'\') LIKE ? OR COALESCE(b.note, \'\') LIKE ?)');
    const value = `%${filters.q}%`;
    params.push(value, value, value, value);
  }
  const browseDirect = filters.direct === 'true';
  if (filters.collectionId === 'none') conditions.push('b.collection_id IS NULL');
  else if (typeof filters.collectionId === 'number') {
    if (browseDirect) {
      assertCollectionExists(userId, filters.collectionId);
      conditions.push('b.collection_id = ?');
      params.push(filters.collectionId);
    } else {
      const ids = descendantIds(userId, filters.collectionId);
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
    newest: 'b.created_at DESC', oldest: 'b.created_at ASC', title: 'b.title COLLATE NOCASE ASC', popular: 'b.click_count DESC, b.created_at DESC',
  };
  const total = (getDb().prepare(`SELECT COUNT(*) AS count FROM bookmarks b ${where}`).get(...params) as { count: number }).count;
  // all 模式(浏览视图整树渲染)跳过分页,一次返回全部结果
  const fetchAll = filters.all === 'true';
  const rows = getDb().prepare(`
    SELECT b.id, b.url, b.title, b.description, b.note, b.favicon_url AS faviconUrl,
      b.cover_url AS coverUrl, b.is_favorite AS isFavorite, b.click_count AS clickCount,
      b.last_visited_at AS lastVisitedAt, b.collection_id AS collectionId, c.name AS collectionName,
      b.created_at AS createdAt, b.updated_at AS updatedAt
    FROM bookmarks b LEFT JOIN collections c ON c.id=b.collection_id AND c.user_id=b.user_id ${where}
    ORDER BY ${orderBy[filters.sort]} ${fetchAll ? 'LIMIT -1' : 'LIMIT ? OFFSET ?'}
  `).all(...(fetchAll ? params : [...params, filters.pageSize, (filters.page - 1) * filters.pageSize])) as BookmarkRow[];
  const tags = getTagsForBookmarkIds(rows.map((row) => row.id));
  const categoryPaths = getCategoryPaths(userId, rows.flatMap((row) => row.collectionId === null ? [] : [row.collectionId]));
  return {
    items: rows.map((row) => toBookmark(row, tags.get(row.id) ?? [], row.collectionId === null ? [] : (categoryPaths.get(row.collectionId) ?? []))),
    total, page: fetchAll ? 1 : filters.page, pageSize: fetchAll ? total : filters.pageSize,
  };
}

export function visitBookmark(userId: number, id: number): number {
  const result = getDb().prepare(`UPDATE bookmarks SET click_count=click_count+1, last_visited_at=?, updated_at=? WHERE id=? AND user_id=? AND deleted_at IS NULL`).run(now(), now(), id, userId);
  if (result.changes === 0) throw notFound('书签');
  return (getDb().prepare('SELECT click_count AS count FROM bookmarks WHERE id=? AND user_id=?').get(id, userId) as { count: number }).count;
}

export function getStats(userId: number): { bookmarks: number; collections: number; tags: number; uncategorized: number; favorites: number; trashed: number } {
  const count = (sql: string) => (getDb().prepare(sql).get(userId) as { count: number }).count;
  return {
    bookmarks: count('SELECT COUNT(*) AS count FROM bookmarks WHERE user_id=? AND deleted_at IS NULL'),
    collections: count('SELECT COUNT(*) AS count FROM collections WHERE user_id=?'),
    tags: count('SELECT COUNT(*) AS count FROM tags WHERE user_id=?'),
    uncategorized: count('SELECT COUNT(*) AS count FROM bookmarks WHERE user_id=? AND deleted_at IS NULL AND collection_id IS NULL'),
    favorites: count('SELECT COUNT(*) AS count FROM bookmarks WHERE user_id=? AND deleted_at IS NULL AND is_favorite=1'),
    trashed: count('SELECT COUNT(*) AS count FROM bookmarks WHERE user_id=? AND deleted_at IS NOT NULL'),
  };
}

export function batchMoveBookmarks(userId: number, ids: number[], collectionId: number | null): { updated: number } {
  assertCollectionExists(userId, collectionId);
  if (ids.length === 0) return { updated: 0 };
  const placeholders = ids.map(() => '?').join(',');
  const result = getDb().prepare(`UPDATE bookmarks SET collection_id=?, updated_at=? WHERE id IN (${placeholders}) AND user_id=? AND deleted_at IS NULL`).run(collectionId ?? null, now(), ...ids, userId);
  return { updated: Number(result.changes) };
}

export function batchAddTags(userId: number, ids: number[], inputTags: string[]): { tagsCreated: number } {
  const tags = normalizedTags(inputTags);
  if (tags.length === 0 || ids.length === 0) return { tagsCreated: 0 };
  const timestamp = now();
  const insertTag = getDb().prepare('INSERT OR IGNORE INTO tags (user_id, name, created_at) VALUES (?, ?, ?)');
  const findTag = getDb().prepare('SELECT id FROM tags WHERE user_id=? AND name=?');
  const link = getDb().prepare('INSERT OR IGNORE INTO bookmark_tags (bookmark_id, tag_id) VALUES (?, ?)');

  // 确保只为属于该 userId 的书签打标签
  const placeholders = ids.map(() => '?').join(',');
  const validBookmarks = (getDb().prepare(`SELECT id FROM bookmarks WHERE id IN (${placeholders}) AND user_id=? AND deleted_at IS NULL`).all(...ids, userId) as Array<{ id: number }>).map((b) => b.id);

  let tagsCreated = 0;
  for (const tag of tags) {
    insertTag.run(userId, tag, timestamp);
    const row = findTag.get(userId, tag) as { id: number } | undefined;
    if (row) {
      for (const id of validBookmarks) {
        link.run(id, row.id);
      }
      tagsCreated++;
    }
  }
  return { tagsCreated };
}

export function batchDeleteBookmarks(userId: number, ids: number[]): { updated: number } {
  if (ids.length === 0) return { updated: 0 };
  const timestamp = now();
  const placeholders = ids.map(() => '?').join(',');
  const result = getDb().prepare(`UPDATE bookmarks SET deleted_at=?, updated_at=? WHERE id IN (${placeholders}) AND user_id=? AND deleted_at IS NULL`).run(timestamp, timestamp, ...ids, userId);
  return { updated: Number(result.changes) };
}
