import type { Bookmark, BookmarkFilters, BookmarkPayload, Collection, ImportResult, PaginatedBookmarks, Stats, Tag, TrashedBookmark } from './types';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, init);
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: { message?: string } } | null;
    throw new Error(body?.error?.message ?? `请求失败（${response.status}）`);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

function json(method: string, body?: unknown): RequestInit {
  return { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) };
}

export const api = {
  stats: () => request<Stats>('/stats'),
  collections: () => request<Collection[]>('/collections'),
  tags: () => request<Tag[]>('/tags'),
  bookmarks: (filters: BookmarkFilters) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) if (value !== undefined && value !== '') params.set(key, String(value));
    return request<PaginatedBookmarks>(`/bookmarks?${params.toString()}`);
  },
  createBookmark: (payload: BookmarkPayload) => request<Bookmark>('/bookmarks', json('POST', payload)),
  updateBookmark: (id: number, payload: Partial<BookmarkPayload>) => request<Bookmark>(`/bookmarks/${id}`, json('PATCH', payload)),
  deleteBookmark: (id: number) => request<void>(`/bookmarks/${id}`, { method: 'DELETE' }),
  visitBookmark: (id: number) => request<{ clickCount: number }>(`/bookmarks/${id}/visit`, { method: 'POST' }),
  trash: () => request<TrashedBookmark[]>('/trash'),
  restoreBookmark: (id: number) => request<Bookmark>(`/trash/${id}/restore`, { method: 'POST' }),
  permanentlyDeleteBookmark: (id: number) => request<void>(`/trash/${id}`, { method: 'DELETE' }),
  emptyTrash: () => request<{ deleted: number }>('/trash', { method: 'DELETE' }),
  batchMoveBookmarks: (ids: number[], collectionId: number | null) => request<{ updated: number }>('/bookmarks/batch/move', json('POST', { ids, collectionId })),
  batchAddTags: (ids: number[], tags: string[]) => request<{ tagsCreated: number }>('/bookmarks/batch/tags', json('POST', { ids, tags })),
  batchDeleteBookmarks: (ids: number[]) => request<{ updated: number }>('/bookmarks/batch/delete', json('POST', { ids })),
  createCollection: (payload: { name: string; parentId?: number | null }) => request<Collection>('/collections', json('POST', payload)),
  updateCollection: (id: number, payload: { name?: string; parentId?: number | null }) => request<Collection>(`/collections/${id}`, json('PATCH', payload)),
  deleteCollection: (id: number) => request<void>(`/collections/${id}`, { method: 'DELETE' }),
  reorderCollections: (parentId: number | null, orderedIds: number[]) => request<{ ok: boolean }>('/collections/reorder', json('POST', { parentId, orderedIds })),
  deleteTag: (id: number) => request<void>(`/tags/${id}`, { method: 'DELETE' }),
  updateTag: (id: number, payload: { name?: string; color?: string | null }) => request<Tag>(`/tags/${id}`, json('PATCH', payload)),
  mergeTags: (sourceId: number, targetId: number) => request<{ moved: number }>(`/tags/${sourceId}/merge/${targetId}`, { method: 'POST' }),
  cleanOrphanTags: () => request<{ deleted: number }>('/tags/clean-orphans', { method: 'POST' }),
  fetchTitle: (url: string) => request<{ title: string | null; description: string | null; coverUrl: string | null; faviconUrl: string | null }>('/fetch-title', json('POST', { url })),
  refetchBookmark: (id: number) => request<Bookmark>(`/bookmarks/${id}/refetch`, { method: 'POST' }),
  refetchBatch: (limit?: number) => request<{ queued: number }>('/bookmarks/refetch', json('POST', limit ? { limit } : {})),
  importHtml: async (file: File, mode: 'skip' | 'overwrite' = 'skip', format: 'netscape' | 'raindrop' | 'toby' | 'pocket' = 'netscape') => {
    const html = await file.text();
    return request<ImportResult>('/import', json('POST', { html, mode, format }));
  },
};
