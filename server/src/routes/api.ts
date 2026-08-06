import { Router, text } from 'express';
import { z } from 'zod';
import { AppError, asyncHandler } from '../lib/errors.js';
import { isSafePublicHttpUrl, normalizeUrl } from '../lib/url.js';
import { batchDeleteSchema, batchMoveSchema, batchTagsSchema, bookmarkCreateSchema, bookmarkListSchema, bookmarkUpdateSchema, collectionCreateSchema,
  collectionUpdateSchema, fetchTitleSchema, idParamSchema, importBodySchema, refetchBatchSchema, reorderSchema, tagCreateSchema,
} from '../lib/validators.js';
import { batchAddTags, batchDeleteBookmarks, batchMoveBookmarks, createBookmark, deleteBookmark, emptyTrash, getBookmark, getStats, listBookmarks, listTrashedBookmarks, permanentlyDeleteBookmark, restoreBookmark, updateBookmark, visitBookmark } from '../services/bookmarks.js';
import { enqueueBatchRefetch, fetchMetadata, refetchBookmark } from '../services/metadata.js';
import { createCollection, createTag, deleteCollection, deleteTag, listCollections, listTags, mergeTags, reorderCollections, updateCollection, updateTag, cleanOrphanTags } from '../services/taxonomy.js';
import { buildExport, importNetscapeHtml } from '../services/transfer.js';

export const apiRouter = Router();

apiRouter.get('/health', (_req, res) => res.json({ ok: true }));
apiRouter.get('/stats', (_req, res) => res.json(getStats()));
apiRouter.post('/import', text({ type: 'text/plain', limit: '20mb' }), asyncHandler((req, res) => {
  const payload = typeof req.body === 'string' ? { html: req.body } : req.body;
  const result = importNetscapeHtml(importBodySchema.parse(payload));
  // 导入完成后后台补抓缺失的封面与描述，不阻塞响应
  enqueueBatchRefetch();
  res.json(result);
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
apiRouter.post('/bookmarks/batch/move', asyncHandler((req, res) => {
  const input = batchMoveSchema.parse(req.body);
  res.json(batchMoveBookmarks(input.ids, input.collectionId ?? null));
}));
apiRouter.post('/bookmarks/batch/tags', asyncHandler((req, res) => {
  const input = batchTagsSchema.parse(req.body);
  res.json(batchAddTags(input.ids, input.tags));
}));
apiRouter.post('/bookmarks/batch/delete', asyncHandler((req, res) => {
  const input = batchDeleteSchema.parse(req.body);
  res.json(batchDeleteBookmarks(input.ids));
}));

apiRouter.post('/bookmarks/refetch', asyncHandler((req, res) => {
  const input = refetchBatchSchema.parse(req.body ?? {});
  res.json(enqueueBatchRefetch(input.limit));
}));
apiRouter.post('/bookmarks/:id/refetch', asyncHandler(async (req, res) => {
  res.json(await refetchBookmark(idParamSchema.parse(req.params).id));
}));

apiRouter.get('/trash', (_req, res) => {
  res.json(listTrashedBookmarks());
});
apiRouter.post('/trash/:id/restore', asyncHandler((req, res) => {
  res.json(restoreBookmark(idParamSchema.parse(req.params).id));
}));
apiRouter.delete('/trash/:id', asyncHandler((req, res) => {
  permanentlyDeleteBookmark(idParamSchema.parse(req.params).id);
  res.status(204).end();
}));
apiRouter.delete('/trash', (_req, res) => {
  const result = emptyTrash();
  res.json(result);
});

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
apiRouter.post('/collections/reorder', asyncHandler((req, res) => {
  const input = reorderSchema.parse(req.body);
  reorderCollections(input.parentId, input.orderedIds);
  res.json({ ok: true });
}));

apiRouter.get('/tags', (_req, res) => res.json(listTags()));
apiRouter.post('/tags', asyncHandler((req, res) => {
  res.status(201).json(createTag(tagCreateSchema.parse(req.body)));
}));
apiRouter.patch('/tags/:id', asyncHandler((req, res) => {
  res.json(updateTag(idParamSchema.parse(req.params).id, tagCreateSchema.partial().parse(req.body)));
}));
apiRouter.post('/tags/:id/merge/:targetId', asyncHandler((req, res) => {
  const params = z.object({ id: z.coerce.number().int().positive(), targetId: z.coerce.number().int().positive() }).parse(req.params);
  res.json(mergeTags(params.id, params.targetId));
}));
apiRouter.post('/tags/clean-orphans', asyncHandler((_req, res) => {
  res.json(cleanOrphanTags());
}));
apiRouter.delete('/tags/:id', asyncHandler((req, res) => {
  deleteTag(idParamSchema.parse(req.params).id);
  res.status(204).end();
}));

apiRouter.post('/fetch-title', asyncHandler(async (req, res) => {
  if (process.env.DISABLE_FETCH_TITLE === '1') {
    res.json({ title: null, description: null, coverUrl: null, faviconUrl: null });
    return;
  }
  const input = fetchTitleSchema.parse(req.body);
  const url = normalizeUrl(input.url);
  if (!isSafePublicHttpUrl(url)) throw new AppError(400, 'INVALID_URL', '不允许抓取本机或内网地址');
  res.json(await fetchMetadata(url));
}));
