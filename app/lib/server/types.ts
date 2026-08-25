export type User = {
  id: number;
  username: string;
  email: string | null;
  nickname: string | null;
  avatarUrl: string | null;
  role: 'admin' | 'user';
  status: 'active' | 'disabled';
  isDefaultPassword?: boolean;
  createdAt: string;
  updatedAt: string;
};

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

export type Tag = {
  id: number;
  name: string;
  color: string | null;
  count: number;
};
