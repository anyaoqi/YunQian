import type { Bookmark, BookmarkFilters, BookmarkPayload, Collection, ImportResult, PaginatedBookmarks, Stats, Tag } from './types';

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
  createCollection: (payload: { name: string; parentId?: number | null }) => request<Collection>('/collections', json('POST', payload)),
  updateCollection: (id: number, payload: { name?: string; parentId?: number | null }) => request<Collection>(`/collections/${id}`, json('PATCH', payload)),
  deleteCollection: (id: number) => request<void>(`/collections/${id}`, { method: 'DELETE' }),
  deleteTag: (id: number) => request<void>(`/tags/${id}`, { method: 'DELETE' }),
  fetchTitle: (url: string) => request<{ title: string | null; faviconUrl: string | null }>('/fetch-title', json('POST', { url })),
  importHtml: async (file: File, mode: 'skip' | 'overwrite' = 'skip') => {
    const html = await file.text();
    return request<ImportResult>('/import', json('POST', { html, mode }));
  },
};
