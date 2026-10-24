import type { Bookmark, Collection } from '@/lib/types';

/** 在分类树中找到指向某分类的路径(面包屑) */
export function pathToCategory(categories: Collection[], id: number): Collection[] {
  for (const category of categories) {
    if (category.id === id) return [category];
    const childPath = pathToCategory(category.children, id);
    if (childPath.length > 0) return [category, ...childPath];
  }
  return [];
}

/** 子树书签总数(含所有后代) */
export function subtreeTotal(category: Collection, favoriteMode = false): number {
  const own = favoriteMode ? category.favoriteCount : category.bookmarkCount;
  return category.children.reduce((sum, child) => sum + subtreeTotal(child, favoriteMode), own);
}

/** 子树星标书签总数(含所有后代) */
export function favoriteSubtreeCount(category: Collection): number {
  return category.children.reduce((sum, child) => sum + favoriteSubtreeCount(child), category.favoriteCount);
}

/** 星标模式下递归剪枝:只保留子树内有星标书签的分类 */
export function pruneByFavorites(categories: Collection[]): Collection[] {
  return categories
    .map((category) => ({ ...category, children: pruneByFavorites(category.children) }))
    .filter((category) => category.favoriteCount > 0 || category.children.length > 0);
}

/** 收集子树全部分类 id(含自身) */
export function collectSubtreeIds(category: Collection, into = new Set<number>()): Set<number> {
  into.add(category.id);
  for (const child of category.children) collectSubtreeIds(child, into);
  return into;
}

/** 按服务端排序取某分类子树的全部书签 */
export function subtreeBookmarks(category: Collection, items: Bookmark[]): Bookmark[] {
  const ids = collectSubtreeIds(category);
  return items.filter((bookmark) => bookmark.collectionId !== null && ids.has(bookmark.collectionId));
}

/** 一次性建立 collectionId → 书签 的索引,供多区块各取子树,避免每区块全量 filter */
export function buildCollectionIndex(items: Bookmark[]): Map<number, Bookmark[]> {
  const index = new Map<number, Bookmark[]>();
  for (const bookmark of items) {
    if (bookmark.collectionId === null) continue;
    const bucket = index.get(bookmark.collectionId);
    if (bucket) bucket.push(bookmark);
    else index.set(bookmark.collectionId, [bookmark]);
  }
  return index;
}

/** 基于索引取分类子树书签:代价 O(子树大小) 而非 O(子树数 × 全库书签数) */
export function subtreeBookmarksFromIndex(category: Collection, index: Map<number, Bookmark[]>): Bookmark[] {
  const ids = collectSubtreeIds(category);
  const result: Bookmark[] = [];
  for (const id of ids) {
    const bucket = index.get(id);
    if (bucket) result.push(...bucket);
  }
  return result;
}
