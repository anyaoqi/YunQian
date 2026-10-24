import { db, now } from '../db/index';
import { notFound } from '../lib/errors';
import { assertSafePublicHttpUrl, faviconFor, normalizeUrl } from '../lib/url';
import type { Bookmark } from '../types';
import { getBookmark } from './bookmarks';

export type MetadataResult = {
  title: string | null;
  description: string | null;
  coverUrl: string | null;
  faviconUrl: string | null;
};

function decodeHtml(value: string): string {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)));
}

const FETCH_TIMEOUT_MS = 5_000;
const MAX_HTML = 512_000;

/**
 * 抓取单个网址的 OG 元数据（title / description / og:image）。
 * 失败时返回全 null（faviconUrl 仍给出基于域名的服务链接作为兜底）。
 */
export async function fetchMetadata(rawUrl: string): Promise<MetadataResult> {
  let url: string;
  try {
    url = normalizeUrl(rawUrl);
  } catch {
    return { title: null, description: null, coverUrl: null, faviconUrl: null };
  }
  const fallback: MetadataResult = { title: null, description: null, coverUrl: null, faviconUrl: faviconFor(url) };
  try {
    await assertSafePublicHttpUrl(url);
  } catch {
    return fallback;
  }
  if (process.env.DISABLE_FETCH_TITLE === '1') return fallback;
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { 'User-Agent': 'YunQian/1.0 (local bookmark manager)', Accept: 'text/html,application/xhtml+xml' },
      redirect: 'manual',
    });
    const html = (await response.text()).slice(0, MAX_HTML);
    const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
    const title = titleMatch ? decodeHtml(titleMatch[1].replace(/\s+/g, ' ').trim()).slice(0, 500) : null;
    const descriptionMatch = /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']|<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i.exec(html);
    const description = descriptionMatch ? decodeHtml((descriptionMatch[1] || descriptionMatch[2]).replace(/\s+/g, ' ').trim()).slice(0, 1_000) : null;
    const coverMatch = /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']|<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i.exec(html);
    let coverUrl = coverMatch ? (coverMatch[1] || coverMatch[2]).trim() : null;
    if (coverUrl) {
      // 相对地址补全为绝对地址;解析后仍须是 http(s),拦截 javascript: 等协议入库
      try {
        const resolved = new URL(coverUrl, url);
        coverUrl = resolved.protocol === 'http:' || resolved.protocol === 'https:' ? resolved.href : null;
      } catch {
        coverUrl = null;
      }
    }
    return { title: title || null, description, coverUrl, faviconUrl: faviconFor(url) };
  } catch {
    return fallback;
  }
}

/**
 * 同步补抓单条书签的元数据并写入数据库。
 * 用 COALESCE 保留用户已编辑过的非空值，仅填充缺失字段；
 * favicon_url 始终基于域名刷新。
 */
export async function refetchBookmark(userId: number, bookmarkId: number): Promise<Bookmark> {
  const row = await db.get<{ url: string }>('SELECT url FROM bookmarks WHERE id=? AND user_id=? AND deleted_at IS NULL', [bookmarkId, userId]);
  if (!row) throw notFound('书签');
  const meta = await fetchMetadata(row.url);
  await db.run(`UPDATE bookmarks SET description=COALESCE(?, description), cover_url=COALESCE(?, cover_url), favicon_url=?, updated_at=? WHERE id=? AND user_id=?`,
    [meta.description, meta.coverUrl, meta.faviconUrl, now(), bookmarkId, userId]);
  return getBookmark(userId, bookmarkId);
}

const processing = new Set<number>();
const MAX_CONCURRENCY = 5;
const RETRY_DELAYS_MS = [500, 1500];

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 带指数退避重试的抓取：仅当拿到 description 或 coverUrl 才视为成功。 */
async function fetchMetadataWithRetry(url: string): Promise<MetadataResult> {
  let result = await fetchMetadata(url);
  for (const waitMs of RETRY_DELAYS_MS) {
    if (result.description || result.coverUrl) return result;
    await delay(waitMs);
    result = await fetchMetadata(url);
  }
  return result;
}

async function processQueue(ids: number[]): Promise<void> {
  const queue = [...ids];
  const worker = async () => {
    while (queue.length > 0) {
      const id = queue.shift();
      if (id === undefined) break;
      try {
        const row = await db.get<{ url: string }>('SELECT url FROM bookmarks WHERE id=?', [id]);
        if (!row) continue;
        const meta = await fetchMetadataWithRetry(row.url);
        await db.run(`UPDATE bookmarks SET description=COALESCE(?, description), cover_url=COALESCE(?, cover_url), favicon_url=?, updated_at=? WHERE id=?`,
          [meta.description, meta.coverUrl, meta.faviconUrl, now(), id]);
      } catch (error) {
        // 单条失败(连接抖动/池耗尽)只跳过该条;异常若穿透到 Promise.all,
        // 未处理的 rejection 会让整个 Node 进程终止。
        console.error('[metadata] 后台补抓失败 id=%d:', id, error);
      } finally {
        processing.delete(id);
      }
    }
  };
  const workers = Array.from({ length: Math.min(MAX_CONCURRENCY, ids.length) }, () => worker());
  await Promise.all(workers);
}

/**
 * 把当前用户「缺少 description 且缺少 cover_url」的书签放入内存队列后台补抓。
 */
export async function enqueueBatchRefetch(userId: number, limit = 200): Promise<{ queued: number }> {
  const rows = await db.all<{ id: number }>(`
    SELECT id FROM bookmarks
    WHERE user_id=? AND deleted_at IS NULL AND description IS NULL AND cover_url IS NULL
    ORDER BY created_at DESC LIMIT ?
  `, [userId, limit]);
  const ids = rows.map((row) => row.id).filter((id) => !processing.has(id));
  for (const id of ids) processing.add(id);
  if (ids.length > 0) void processQueue(ids).catch((error) => console.error('[metadata] 后台补抓队列异常:', error));
  return { queued: ids.length };
}
