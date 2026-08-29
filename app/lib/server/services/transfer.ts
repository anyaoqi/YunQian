import { db, inTransaction, now } from '../db/index';
import type { Db } from '../db/index';
import { AppError, notFound } from '../lib/errors';
import type { ImportedBookmark } from '../lib/html';
import { parseNetscapeBookmarks } from '../lib/html';
import { faviconFor, normalizeUrl, titleFallback } from '../lib/url';
import { syncBookmarkTags } from './bookmarks';

type ImportOptions = { collectionId?: number | null; mode?: 'skip' | 'overwrite' };

async function assertCollection(userId: number, id: number | null | undefined): Promise<void> {
  if (id === null || id === undefined) return;
  const found = await db.get<{ one: number }>('SELECT 1 AS one FROM collections WHERE id=? AND user_id=?', [id, userId]);
  if (!found) throw notFound('导入目标分类');
}

async function collectionIdForPath(tx: Db, userId: number, path: string[], rootId: number | null, created: { value: number }): Promise<number | null> {
  let parentId = rootId;
  for (const name of path) {
    const existing = parentId === null
      ? await tx.get<{ id: number }>('SELECT id FROM collections WHERE user_id=? AND parent_id IS NULL AND name=?', [userId, name])
      : await tx.get<{ id: number }>('SELECT id FROM collections WHERE user_id=? AND parent_id=? AND name=?', [userId, parentId, name]);
    if (existing) {
      parentId = existing.id;
      continue;
    }
    const timestamp = now();
    const row = await tx.get<{ id: number }>('INSERT INTO collections (user_id, parent_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?) RETURNING id', [userId, parentId, name, timestamp, timestamp]);
    parentId = row!.id;
    created.value += 1;
  }
  return parentId;
}

export async function importNetscapeHtml(userId: number, options: { html: string; collectionId?: number | null; mode?: 'skip' | 'overwrite' }): Promise<{ imported: number; skipped: number; collectionsCreated: number; tagsCreated: number; durationMs: number }> {
  const html = options.html.trim();
  if (!/<(?:DL|A|H3)\b/i.test(html)) throw new AppError(400, 'BAD_IMPORT_FILE', '这不是可识别的浏览器书签 HTML 文件');
  const parsed = parseNetscapeBookmarks(html);
  if (parsed.length === 0) throw new AppError(400, 'BAD_IMPORT_FILE', '未在文件中找到可导入的 http(s) 书签');
  return importBookmarks(userId, parsed, { collectionId: options.collectionId, mode: options.mode });
}

/** 通用导入：接收已解析的书签条目，写入数据库。供各格式导入器复用。 */
export async function importBookmarks(userId: number, entries: ImportedBookmark[], options: ImportOptions): Promise<{ imported: number; skipped: number; collectionsCreated: number; tagsCreated: number; durationMs: number }> {
  const startedAt = Date.now();
  await assertCollection(userId, options.collectionId);
  const stats = { imported: 0, skipped: 0, collectionsCreated: 0, tagsCreated: 0 };
  const knownTags = new Set((await db.all<{ name: string }>('SELECT name FROM tags WHERE user_id=?', [userId])).map((tag) => tag.name));
  const createdCollections = { value: 0 };
  await inTransaction(async (tx) => {
    for (const entry of entries) {
      let url: string;
      try { url = normalizeUrl(entry.url); } catch { stats.skipped += 1; continue; }
      const existing = await tx.get<{ id: number }>('SELECT id FROM bookmarks WHERE user_id=? AND url=?', [userId, url]);
      if (existing && options.mode !== 'overwrite') { stats.skipped += 1; continue; }
      const collectionId = await collectionIdForPath(tx, userId, entry.collectionPath, options.collectionId ?? null, createdCollections);
      const tags = [...new Set(entry.tags)];
      for (const tag of tags) {
        if (!knownTags.has(tag)) { knownTags.add(tag); stats.tagsCreated += 1; }
      }
      const title = entry.title || titleFallback(url);
      if (existing) {
        await tx.run(`UPDATE bookmarks SET collection_id=?, title=?, description=?, favicon_url=?, updated_at=? WHERE id=? AND user_id=?`, [
          collectionId, title, entry.description, faviconFor(url), now(), existing.id, userId,
        ]);
        await syncBookmarkTags(tx, userId, existing.id, tags);
      } else {
        const timestamp = entry.createdAt ?? now();
        const row = await tx.get<{ id: number }>(`
          INSERT INTO bookmarks (user_id, collection_id, url, title, description, favicon_url, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          RETURNING id
        `, [userId, collectionId, url, title, entry.description, faviconFor(url), timestamp, timestamp]);
        await syncBookmarkTags(tx, userId, row!.id, tags);
      }
      stats.imported += 1;
    }
  });
  stats.collectionsCreated = createdCollections.value;
  return { ...stats, durationMs: Date.now() - startedAt };
}

export async function buildExport(userId: number): Promise<object> {
  const collections = await db.all(`SELECT id, name, parent_id AS "parentId", icon, color, sort_order AS "sortOrder", created_at AS "createdAt", updated_at AS "updatedAt" FROM collections WHERE user_id=? ORDER BY id`, [userId]);
  const tags = await db.all(`SELECT id, name, color, created_at AS "createdAt" FROM tags WHERE user_id=? ORDER BY id`, [userId]);
  const rows = await db.all<Record<string, unknown> & { id: number }>(`
    SELECT id, url, title, description, note, favicon_url AS "faviconUrl", cover_url AS "coverUrl",
      is_favorite AS "isFavorite", click_count AS "clickCount", last_visited_at AS "lastVisitedAt",
      collection_id AS "collectionId", created_at AS "createdAt", updated_at AS "updatedAt"
    FROM bookmarks WHERE user_id=? AND deleted_at IS NULL ORDER BY id
  `, [userId]);
  const tagRows = await db.all<{ bookmarkId: number; name: string }>(`
    SELECT bt.bookmark_id AS "bookmarkId", t.name
    FROM bookmark_tags bt
    JOIN tags t ON t.id=bt.tag_id
    JOIN bookmarks b ON b.id=bt.bookmark_id
    WHERE b.user_id=? ORDER BY t.name
  `, [userId]);
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
export async function buildHtmlExport(userId: number): Promise<string> {
  type CollectionRow = { id: number; name: string; parentId: number | null };
  type BookmarkRow = { id: number; url: string; title: string; description: string | null; collectionId: number | null; createdAt: string; tags: string[] };
  const collections = await db.all<CollectionRow>('SELECT id, name, parent_id AS "parentId" FROM collections WHERE user_id=? ORDER BY sort_order ASC, name ASC', [userId]);
  const rows = await db.all<Omit<BookmarkRow, 'tags'>>(`
    SELECT id, url, title, description, collection_id AS "collectionId", created_at AS "createdAt"
    FROM bookmarks WHERE user_id=? AND deleted_at IS NULL ORDER BY created_at DESC
  `, [userId]);
  const tagRows = await db.all<{ bookmarkId: number; name: string }>(`
    SELECT bt.bookmark_id AS "bookmarkId", t.name
    FROM bookmark_tags bt
    JOIN tags t ON t.id=bt.tag_id
    JOIN bookmarks b ON b.id=bt.bookmark_id
    WHERE b.user_id=? ORDER BY t.name
  `, [userId]);
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

  let html = '<!DOCTYPE NETSCAPE-Bookmark-file-1>\n<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">\n<TITLE>云签导出</TITLE>\n<H1>云签书签</H1>\n<DL><p>\n';
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
