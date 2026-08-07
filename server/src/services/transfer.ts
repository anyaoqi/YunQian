import { db, inTransaction, now } from '../db/index.js';
import { AppError, notFound } from '../lib/errors.js';
import type { ImportedBookmark } from '../lib/html.js';
import { parseNetscapeBookmarks } from '../lib/html.js';
import { faviconFor, normalizeUrl, titleFallback } from '../lib/url.js';
import { syncBookmarkTags } from './bookmarks.js';

type ImportOptions = { collectionId?: number | null; mode?: 'skip' | 'overwrite' };

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

export function importNetscapeHtml(options: { html: string; collectionId?: number | null; mode?: 'skip' | 'overwrite' }): { imported: number; skipped: number; collectionsCreated: number; tagsCreated: number; durationMs: number } {
  const html = options.html.trim();
  if (!/<(?:DL|A|H3)\b/i.test(html)) throw new AppError(400, 'BAD_IMPORT_FILE', '这不是可识别的浏览器书签 HTML 文件');
  const parsed = parseNetscapeBookmarks(html);
  if (parsed.length === 0) throw new AppError(400, 'BAD_IMPORT_FILE', '未在文件中找到可导入的 http(s) 书签');
  return importBookmarks(parsed, { collectionId: options.collectionId, mode: options.mode });
}

/** 通用导入：接收已解析的书签条目，写入数据库。供各格式导入器复用。 */
export function importBookmarks(entries: ImportedBookmark[], options: ImportOptions): { imported: number; skipped: number; collectionsCreated: number; tagsCreated: number; durationMs: number } {
  const startedAt = Date.now();
  assertCollection(options.collectionId);
  const stats = { imported: 0, skipped: 0, collectionsCreated: 0, tagsCreated: 0 };
  const knownTags = new Set((db.prepare('SELECT name FROM tags WHERE user_id=1').all() as Array<{ name: string }>).map((tag) => tag.name));
  const createdCollections = { value: 0 };
  inTransaction(() => {
    for (const entry of entries) {
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

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * 导出为 Netscape bookmarks.html 格式，可被 Chrome/Edge/Firefox/Safari 导入。
 */
export function buildHtmlExport(): string {
  type CollectionRow = { id: number; name: string; parentId: number | null };
  type BookmarkRow = { id: number; url: string; title: string; description: string | null; collectionId: number | null; createdAt: string; tags: string[] };
  const collections = db.prepare('SELECT id, name, parent_id AS parentId FROM collections ORDER BY sort_order ASC, name ASC').all() as CollectionRow[];
  const rows = db.prepare(`
    SELECT id, url, title, description, collection_id AS collectionId, created_at AS createdAt
    FROM bookmarks WHERE deleted_at IS NULL ORDER BY created_at DESC
  `).all() as Array<Omit<BookmarkRow, 'tags'>>;
  const tagRows = db.prepare(`SELECT bt.bookmark_id AS bookmarkId, t.name FROM bookmark_tags bt JOIN tags t ON t.id=bt.tag_id ORDER BY t.name`).all() as Array<{ bookmarkId: number; name: string }>;
  const tagsByBookmark = new Map<number, string[]>();
  for (const row of tagRows) (tagsByBookmark.get(row.bookmarkId) ?? tagsByBookmark.set(row.bookmarkId, []).get(row.bookmarkId)!).push(row.name);
  const bookmarks: BookmarkRow[] = rows.map((row) => ({ ...row, tags: tagsByBookmark.get(row.id) ?? [] }));

  const childrenOf = (parentId: number | null) => collections.filter((c) => c.parentId === parentId);
  const bookmarksOf = (collectionId: number | null) => bookmarks.filter((b) => b.collectionId === collectionId);

  const renderFolder = (collection: CollectionRow, depth: number): string => {
    const indent = '    '.repeat(depth);
    const addDate = Math.floor(Date.now() / 1000);
    let out = `${indent}<DT><H3 ADD_DATE="${addDate}">${escapeHtml(collection.name)}</H3>\n`;
    out += `${indent}<DL><p>\n`;
    for (const child of childrenOf(collection.id)) out += renderFolder(child, depth + 1);
    for (const bookmark of bookmarksOf(collection.id)) {
      const tags = bookmark.tags.length > 0 ? ` TAGS="${escapeHtml(bookmark.tags.join(','))}"` : '';
      const date = Math.floor(new Date(bookmark.createdAt).getTime() / 1000) || addDate;
      out += `${indent}    <DT><A HREF="${escapeHtml(bookmark.url)}" ADD_DATE="${date}"${tags}>${escapeHtml(bookmark.title)}</A>\n`;
      if (bookmark.description) out += `${indent}    <DD>${escapeHtml(bookmark.description)}\n`;
    }
    out += `${indent}</DL><p>\n`;
    return out;
  };

  let html = '<!DOCTYPE NETSCAPE-Bookmark-file-1>\n<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">\n<TITLE>LinkNest 导出</TITLE>\n<H1>LinkNest 书签</H1>\n<DL><p>\n';
  for (const root of childrenOf(null)) html += renderFolder(root, 1);
  for (const bookmark of bookmarksOf(null)) {
    const tags = bookmark.tags.length > 0 ? ` TAGS="${escapeHtml(bookmark.tags.join(','))}"` : '';
    const date = Math.floor(new Date(bookmark.createdAt).getTime() / 1000) || Math.floor(Date.now() / 1000);
    html += `    <DT><A HREF="${escapeHtml(bookmark.url)}" ADD_DATE="${date}"${tags}>${escapeHtml(bookmark.title)}</A>\n`;
    if (bookmark.description) html += `    <DD>${escapeHtml(bookmark.description)}\n`;
  }
  html += '</DL><p>\n';
  return html;
}
