import { db, inTransaction, now } from '../db/index.js';
import { AppError, notFound } from '../lib/errors.js';
import { faviconFor, normalizeUrl, titleFallback } from '../lib/url.js';
import type { Bookmark } from '../types.js';

type BookmarkRow = Omit<Bookmark, 'tags'> & { isFavorite: number | boolean };
type BookmarkInput = {
  url: string;
  title?: string;
  description?: string | null;
  note?: string | null;
  collectionId?: number | null;
  tags?: string[];
  isFavorite?: boolean;
};
type BookmarkFilters = {
  q?: string;
  collectionId?: number | 'none';
  tag?: string;
  favorite?: 'true' | 'false';
  sort: 'newest' | 'oldest' | 'title' | 'popular';
  page: number;
  pageSize: number;
};

function toBookmark(row: BookmarkRow, tags: string[] = []): Bookmark {
  return { ...row, isFavorite: Boolean(row.isFavorite), tags };
}

function assertCollectionExists(collectionId: number | null | undefined): void {
  if (collectionId === null || collectionId === undefined) return;
  const found = db.prepare('SELECT 1 FROM collections WHERE id=?').get(collectionId);
  if (!found) throw notFound('集合');
}

function normalizedTags(tags: string[]): string[] {
  return [...new Set(tags.map((tag) => tag.trim()).filter(Boolean))];
}

export function syncBookmarkTags(bookmarkId: number, inputTags: string[]): void {
  const tags = normalizedTags(inputTags);
  db.prepare('DELETE FROM bookmark_tags WHERE bookmark_id=?').run(bookmarkId);
  const addTag = db.prepare('INSERT OR IGNORE INTO tags (name, created_at) VALUES (?, ?)');
  const findTag = db.prepare('SELECT id FROM tags WHERE user_id=1 AND name=?');
  const link = db.prepare('INSERT OR IGNORE INTO bookmark_tags (bookmark_id, tag_id) VALUES (?, ?)');
  for (const tag of tags) {
    addTag.run(tag, now());
    const tagRow = findTag.get(tag) as { id: number };
    link.run(bookmarkId, tagRow.id);
  }
}

function getTagsForBookmarkIds(ids: number[]): Map<number, string[]> {
  const tags = new Map<number, string[]>();
  if (ids.length === 0) return tags;
  const placeholders = ids.map(() => '?').join(',');
  const rows = db.prepare(`
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

function getRawBookmark(id: number): BookmarkRow | undefined {
  return db.prepare(`
    SELECT b.id, b.url, b.title, b.description, b.note, b.favicon_url AS faviconUrl,
      b.cover_url AS coverUrl, b.is_favorite AS isFavorite, b.click_count AS clickCount,
      b.last_visited_at AS lastVisitedAt, b.collection_id AS collectionId, c.name AS collectionName,
      b.created_at AS createdAt, b.updated_at AS updatedAt
    FROM bookmarks b LEFT JOIN collections c ON c.id=b.collection_id
    WHERE b.id=? AND b.deleted_at IS NULL
  `).get(id) as BookmarkRow | undefined;
}

export function getBookmark(id: number): Bookmark {
  const row = getRawBookmark(id);
  if (!row) throw notFound('书签');
  const tags = getTagsForBookmarkIds([id]).get(id) ?? [];
  return toBookmark(row, tags);
}

export function createBookmark(input: BookmarkInput): Bookmark {
  const url = normalizeUrl(input.url);
  const existing = db.prepare('SELECT id FROM bookmarks WHERE user_id=1 AND url=?').get(url) as { id: number } | undefined;
  if (existing) throw new AppError(409, 'DUPLICATE_URL', '该网址已收藏', { id: existing.id });
  assertCollectionExists(input.collectionId);
  const title = input.title?.trim() || titleFallback(url);
  const timestamp = now();
  const id = inTransaction(() => {
    const result = db.prepare(`
      INSERT INTO bookmarks (collection_id, url, title, description, note, favicon_url, is_favorite, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(input.collectionId ?? null, url, title, input.description ?? null, input.note ?? null, faviconFor(url), input.isFavorite ? 1 : 0, timestamp, timestamp);
    const bookmarkId = Number(result.lastInsertRowid);
    syncBookmarkTags(bookmarkId, input.tags ?? []);
    return bookmarkId;
  });
  return getBookmark(id);
}

export function updateBookmark(id: number, input: Partial<BookmarkInput>): Bookmark {
  const current = getRawBookmark(id);
  if (!current) throw notFound('书签');
  const url = input.url === undefined ? current.url : normalizeUrl(input.url);
  if (url !== current.url) {
    const duplicate = db.prepare('SELECT id FROM bookmarks WHERE user_id=1 AND url=? AND id<>?').get(url, id) as { id: number } | undefined;
    if (duplicate) throw new AppError(409, 'DUPLICATE_URL', '该网址已收藏', { id: duplicate.id });
  }
  const collectionId = input.collectionId === undefined ? current.collectionId : input.collectionId;
  assertCollectionExists(collectionId);
  inTransaction(() => {
    db.prepare(`
      UPDATE bookmarks SET url=?, title=?, description=?, note=?, collection_id=?, favicon_url=?, is_favorite=?, updated_at=?
      WHERE id=?
    `).run(
      url,
      input.title === undefined ? current.title : (input.title.trim() || titleFallback(url)),
      input.description === undefined ? current.description : input.description,
      input.note === undefined ? current.note : input.note,
      collectionId ?? null,
      url === current.url ? current.faviconUrl : faviconFor(url),
      input.isFavorite === undefined ? (current.isFavorite ? 1 : 0) : (input.isFavorite ? 1 : 0),
      now(), id,
    );
    if (input.tags !== undefined) syncBookmarkTags(id, input.tags);
  });
  return getBookmark(id);
}

export function deleteBookmark(id: number): void {
  const result = db.prepare('DELETE FROM bookmarks WHERE id=?').run(id);
  if (result.changes === 0) throw notFound('书签');
}

function descendantIds(collectionId: number): number[] {
  const rows = db.prepare(`
    WITH RECURSIVE tree(id) AS (
      SELECT id FROM collections WHERE id=?
      UNION ALL SELECT c.id FROM collections c JOIN tree t ON c.parent_id=t.id
    ) SELECT id FROM tree
  `).all(collectionId) as Array<{ id: number }>;
  if (rows.length === 0) throw notFound('集合');
  return rows.map((row) => row.id);
}

export function listBookmarks(filters: BookmarkFilters): { items: Bookmark[]; total: number; page: number; pageSize: number } {
  const conditions = ['b.deleted_at IS NULL'];
  const params: (string | number)[] = [];
  if (filters.q) {
    conditions.push('(b.title LIKE ? OR b.url LIKE ? OR COALESCE(b.description, \'\') LIKE ? OR COALESCE(b.note, \'\') LIKE ?)');
    const value = `%${filters.q}%`;
    params.push(value, value, value, value);
  }
  if (filters.collectionId === 'none') conditions.push('b.collection_id IS NULL');
  else if (typeof filters.collectionId === 'number') {
    const ids = descendantIds(filters.collectionId);
    conditions.push(`b.collection_id IN (${ids.map(() => '?').join(',')})`);
    params.push(...ids);
  }
  if (filters.tag) {
    conditions.push('EXISTS (SELECT 1 FROM bookmark_tags bt JOIN tags t ON t.id=bt.tag_id WHERE bt.bookmark_id=b.id AND t.name=?)');
    params.push(filters.tag);
  }
  if (filters.favorite) conditions.push('b.is_favorite=?'), params.push(filters.favorite === 'true' ? 1 : 0);
  const where = `WHERE ${conditions.join(' AND ')}`;
  const orderBy: Record<BookmarkFilters['sort'], string> = {
    newest: 'b.created_at DESC', oldest: 'b.created_at ASC', title: 'b.title COLLATE NOCASE ASC', popular: 'b.click_count DESC, b.created_at DESC',
  };
  const total = (db.prepare(`SELECT COUNT(*) AS count FROM bookmarks b ${where}`).get(...params) as { count: number }).count;
  const rows = db.prepare(`
    SELECT b.id, b.url, b.title, b.description, b.note, b.favicon_url AS faviconUrl,
      b.cover_url AS coverUrl, b.is_favorite AS isFavorite, b.click_count AS clickCount,
      b.last_visited_at AS lastVisitedAt, b.collection_id AS collectionId, c.name AS collectionName,
      b.created_at AS createdAt, b.updated_at AS updatedAt
    FROM bookmarks b LEFT JOIN collections c ON c.id=b.collection_id ${where}
    ORDER BY ${orderBy[filters.sort]} LIMIT ? OFFSET ?
  `).all(...params, filters.pageSize, (filters.page - 1) * filters.pageSize) as BookmarkRow[];
  const tags = getTagsForBookmarkIds(rows.map((row) => row.id));
  return { items: rows.map((row) => toBookmark(row, tags.get(row.id) ?? [])), total, page: filters.page, pageSize: filters.pageSize };
}

export function visitBookmark(id: number): number {
  const result = db.prepare(`UPDATE bookmarks SET click_count=click_count+1, last_visited_at=?, updated_at=? WHERE id=? AND deleted_at IS NULL`).run(now(), now(), id);
  if (result.changes === 0) throw notFound('书签');
  return (db.prepare('SELECT click_count AS count FROM bookmarks WHERE id=?').get(id) as { count: number }).count;
}

export function getStats(): { bookmarks: number; collections: number; tags: number; uncategorized: number; favorites: number } {
  const count = (sql: string) => (db.prepare(sql).get() as { count: number }).count;
  return {
    bookmarks: count('SELECT COUNT(*) AS count FROM bookmarks WHERE deleted_at IS NULL'),
    collections: count('SELECT COUNT(*) AS count FROM collections'),
    tags: count('SELECT COUNT(*) AS count FROM tags'),
    uncategorized: count('SELECT COUNT(*) AS count FROM bookmarks WHERE deleted_at IS NULL AND collection_id IS NULL'),
    favorites: count('SELECT COUNT(*) AS count FROM bookmarks WHERE deleted_at IS NULL AND is_favorite=1'),
  };
}
