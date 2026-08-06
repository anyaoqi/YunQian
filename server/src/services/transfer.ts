import { db, inTransaction, now } from '../db/index.js';
import { AppError, notFound } from '../lib/errors.js';
import { parseNetscapeBookmarks } from '../lib/html.js';
import { faviconFor, normalizeUrl, titleFallback } from '../lib/url.js';
import { syncBookmarkTags } from './bookmarks.js';

type ImportOptions = { html: string; collectionId?: number | null; mode?: 'skip' | 'overwrite' };

function assertCollection(id: number | null | undefined): void {
  if (id === null || id === undefined) return;
  if (!db.prepare('SELECT 1 FROM collections WHERE id=?').get(id)) throw notFound('导入目标分类');
}

function collectionIdForPath(path: string[], rootId: number | null, created: { value: number }): number | null {
  let parentId = rootId;
  for (const name of path) {
    const existing = parentId === null
      ? db.prepare('SELECT id FROM collections WHERE user_id=1 AND parent_id IS NULL AND name=?').get(name) as { id: number } | undefined
      : db.prepare('SELECT id FROM collections WHERE user_id=1 AND parent_id=? AND name=?').get(parentId, name) as { id: number } | undefined;
    if (existing) {
      parentId = existing.id;
      continue;
    }
    const timestamp = now();
    const result = db.prepare('INSERT INTO collections (parent_id, name, created_at, updated_at) VALUES (?, ?, ?, ?)').run(parentId, name, timestamp, timestamp);
    parentId = Number(result.lastInsertRowid);
    created.value += 1;
  }
  return parentId;
}

export function importNetscapeHtml(options: ImportOptions): { imported: number; skipped: number; collectionsCreated: number; tagsCreated: number; durationMs: number } {
  const startedAt = Date.now();
  const html = options.html.trim();
  if (!/<(?:DL|A|H3)\b/i.test(html)) throw new AppError(400, 'BAD_IMPORT_FILE', '这不是可识别的浏览器书签 HTML 文件');
  const parsed = parseNetscapeBookmarks(html);
  if (parsed.length === 0) throw new AppError(400, 'BAD_IMPORT_FILE', '未在文件中找到可导入的 http(s) 书签');
  assertCollection(options.collectionId);

  const stats = { imported: 0, skipped: 0, collectionsCreated: 0, tagsCreated: 0 };
  const knownTags = new Set((db.prepare('SELECT name FROM tags WHERE user_id=1').all() as Array<{ name: string }>).map((tag) => tag.name));
  const createdCollections = { value: 0 };
  inTransaction(() => {
    for (const entry of parsed) {
      let url: string;
      try { url = normalizeUrl(entry.url); } catch { stats.skipped += 1; continue; }
      const existing = db.prepare('SELECT id FROM bookmarks WHERE user_id=1 AND url=?').get(url) as { id: number } | undefined;
      if (existing && options.mode !== 'overwrite') { stats.skipped += 1; continue; }
      const collectionId = collectionIdForPath(entry.collectionPath, options.collectionId ?? null, createdCollections);
      const tags = [...new Set(entry.tags)];
      for (const tag of tags) {
        if (!knownTags.has(tag)) { knownTags.add(tag); stats.tagsCreated += 1; }
      }
      const title = entry.title || titleFallback(url);
      if (existing) {
        db.prepare(`UPDATE bookmarks SET collection_id=?, title=?, description=?, favicon_url=?, updated_at=? WHERE id=?`).run(
          collectionId, title, entry.description, faviconFor(url), now(), existing.id,
        );
        syncBookmarkTags(existing.id, tags);
      } else {
        const timestamp = entry.createdAt ?? now();
        const result = db.prepare(`
          INSERT INTO bookmarks (collection_id, url, title, description, favicon_url, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(collectionId, url, title, entry.description, faviconFor(url), timestamp, timestamp);
        syncBookmarkTags(Number(result.lastInsertRowid), tags);
      }
      stats.imported += 1;
    }
  });
  stats.collectionsCreated = createdCollections.value;
  return { ...stats, durationMs: Date.now() - startedAt };
}

export function buildExport(): object {
  const collections = db.prepare(`SELECT id, name, parent_id AS parentId, icon, color, sort_order AS sortOrder, created_at AS createdAt, updated_at AS updatedAt FROM collections ORDER BY id`).all();
  const tags = db.prepare(`SELECT id, name, color, created_at AS createdAt FROM tags ORDER BY id`).all();
  const rows = db.prepare(`
    SELECT id, url, title, description, note, favicon_url AS faviconUrl, cover_url AS coverUrl,
      is_favorite AS isFavorite, click_count AS clickCount, last_visited_at AS lastVisitedAt,
      collection_id AS collectionId, created_at AS createdAt, updated_at AS updatedAt
    FROM bookmarks WHERE deleted_at IS NULL ORDER BY id
  `).all() as Array<Record<string, unknown> & { id: number }>;
  const tagRows = db.prepare(`SELECT bt.bookmark_id AS bookmarkId, t.name FROM bookmark_tags bt JOIN tags t ON t.id=bt.tag_id ORDER BY t.name`).all() as Array<{ bookmarkId: number; name: string }>;
  const tagsByBookmark = new Map<number, string[]>();
  for (const row of tagRows) (tagsByBookmark.get(row.bookmarkId) ?? tagsByBookmark.set(row.bookmarkId, []).get(row.bookmarkId)!).push(row.name);
  const bookmarks = rows.map((bookmark) => ({ ...bookmark, isFavorite: Boolean(bookmark.isFavorite), tags: tagsByBookmark.get(bookmark.id) ?? [] }));
  return { version: 1, exportedAt: now(), collections, tags, bookmarks };
}
