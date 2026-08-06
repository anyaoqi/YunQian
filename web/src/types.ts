export type Bookmark = {
  id: number;
  url: string;
  title: string;
  description: string | null;
  note: string | null;
  faviconUrl: string | null;
  coverUrl: string | null;
  isFavorite: boolean;
  clickCount: number;
  lastVisitedAt: string | null;
  collectionId: number | null;
  collectionName: string | null;
  categoryPath: string[];
  tags: string[];
  createdAt: string;
  updatedAt: string;
};

export type Collection = {
  id: number;
  name: string;
  parentId: number | null;
  icon: string | null;
  color: string | null;
  sortOrder: number;
  bookmarkCount: number;
  favoriteCount: number;
  children: Collection[];
};

export type Tag = { id: number; name: string; color: string | null; count: number };
export type Stats = { bookmarks: number; collections: number; tags: number; uncategorized: number; favorites: number };
export type Sort = 'newest' | 'oldest' | 'title' | 'popular';
export type BookmarkFilters = {
  q?: string;
  collectionId?: number | 'none';
  tag?: string;
  favorite?: 'true' | 'false';
  direct?: 'true' | 'false';
  sort: Sort;
  page: number;
  pageSize: number;
};
export type BookmarkPayload = {
  url: string;
  title?: string;
  description?: string | null;
  note?: string | null;
  collectionId?: number | null;
  tags?: string[];
  isFavorite?: boolean;
};
export type PaginatedBookmarks = { items: Bookmark[]; total: number; page: number; pageSize: number };
export type ImportResult = { imported: number; skipped: number; collectionsCreated: number; tagsCreated: number; durationMs: number };
