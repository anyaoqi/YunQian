import { Router, text } from 'express';
import { AppError, asyncHandler } from '../lib/errors.js';
import { faviconFor, isSafePublicHttpUrl, normalizeUrl } from '../lib/url.js';
import {
  bookmarkCreateSchema, bookmarkListSchema, bookmarkUpdateSchema, collectionCreateSchema,
  collectionUpdateSchema, fetchTitleSchema, idParamSchema, importBodySchema, tagCreateSchema,
} from '../lib/validators.js';
import { createBookmark, deleteBookmark, getBookmark, getStats, listBookmarks, updateBookmark, visitBookmark } from '../services/bookmarks.js';
import { createCollection, createTag, deleteCollection, deleteTag, listCollections, listTags, updateCollection } from '../services/taxonomy.js';
import { buildExport, importNetscapeHtml } from '../services/transfer.js';

function decodeHtml(text: string): string {
  return text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)));
}

export const apiRouter = Router();

apiRouter.get('/health', (_req, res) => res.json({ ok: true }));
apiRouter.get('/stats', (_req, res) => res.json(getStats()));
apiRouter.post('/import', text({ type: 'text/plain', limit: '20mb' }), asyncHandler((req, res) => {
  const payload = typeof req.body === 'string' ? { html: req.body } : req.body;
  res.json(importNetscapeHtml(importBodySchema.parse(payload)));
}));
apiRouter.get('/export', (_req, res) => {
  const date = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Disposition', `attachment; filename="linknest-export-${date}.json"`);
  res.json(buildExport());
});

apiRouter.get('/bookmarks', asyncHandler((req, res) => {
  res.json(listBookmarks(bookmarkListSchema.parse(req.query)));
}));
apiRouter.post('/bookmarks', asyncHandler((req, res) => {
  const bookmark = createBookmark(bookmarkCreateSchema.parse(req.body));
  res.status(201).json(bookmark);
}));
apiRouter.get('/bookmarks/:id', asyncHandler((req, res) => {
  res.json(getBookmark(idParamSchema.parse(req.params).id));
}));
apiRouter.patch('/bookmarks/:id', asyncHandler((req, res) => {
  res.json(updateBookmark(idParamSchema.parse(req.params).id, bookmarkUpdateSchema.parse(req.body)));
}));
apiRouter.delete('/bookmarks/:id', asyncHandler((req, res) => {
  deleteBookmark(idParamSchema.parse(req.params).id);
  res.status(204).end();
}));
apiRouter.post('/bookmarks/:id/visit', asyncHandler((req, res) => {
  res.json({ clickCount: visitBookmark(idParamSchema.parse(req.params).id) });
}));

apiRouter.get('/collections', (_req, res) => res.json(listCollections()));
apiRouter.post('/collections', asyncHandler((req, res) => {
  res.status(201).json(createCollection(collectionCreateSchema.parse(req.body)));
}));
apiRouter.patch('/collections/:id', asyncHandler((req, res) => {
  res.json(updateCollection(idParamSchema.parse(req.params).id, collectionUpdateSchema.parse(req.body)));
}));
apiRouter.delete('/collections/:id', asyncHandler((req, res) => {
  deleteCollection(idParamSchema.parse(req.params).id);
  res.status(204).end();
}));

apiRouter.get('/tags', (_req, res) => res.json(listTags()));
apiRouter.post('/tags', asyncHandler((req, res) => {
  res.status(201).json(createTag(tagCreateSchema.parse(req.body)));
}));
apiRouter.delete('/tags/:id', asyncHandler((req, res) => {
  deleteTag(idParamSchema.parse(req.params).id);
  res.status(204).end();
}));

apiRouter.post('/fetch-title', asyncHandler(async (req, res) => {
  if (process.env.DISABLE_FETCH_TITLE === '1') {
    res.json({ title: null, faviconUrl: null });
    return;
  }
  const input = fetchTitleSchema.parse(req.body);
  const url = normalizeUrl(input.url);
  if (!isSafePublicHttpUrl(url)) throw new AppError(400, 'INVALID_URL', '不允许抓取本机或内网地址');
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(5_000),
      headers: { 'User-Agent': 'LinkNest/1.0 (local bookmark manager)', Accept: 'text/html,application/xhtml+xml' },
      redirect: 'manual',
    });
    const html = (await response.text()).slice(0, 512_000);
    const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
    const title = match ? decodeHtml(match[1].replace(/\s+/g, ' ').trim()).slice(0, 500) : null;
    res.json({ title: title || null, faviconUrl: faviconFor(url) });
  } catch {
    res.json({ title: null, faviconUrl: faviconFor(url) });
  }
}));
