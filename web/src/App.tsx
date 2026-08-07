import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from './api';
import { BatchActionBar } from './components/BatchActionBar';
import { BatchDialog } from './components/BatchDialog';
import { BookmarkDialog } from './components/BookmarkDialog';
import { BookmarkList } from './components/BookmarkList';
import { CollectionDialog } from './components/CollectionDialog';
import { GridView } from './components/GridView';
import { HomePanel } from './components/HomePanel';
import { ImportDialog } from './components/ImportDialog';
import { Sidebar } from './components/Sidebar';
import { Toolbar } from './components/Toolbar';
import { TagManageDialog } from './components/TagManageDialog';
import { TrashList } from './components/TrashList';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import type { Bookmark, BookmarkFilters, Collection, Sort, Stats, Tag } from './types';

const VIEW_KEY = 'linknest:view';
const VALID_SORTS = ['newest', 'oldest', 'title', 'popular'] as const;
const defaultFilters: BookmarkFilters = { sort: 'newest', page: 1, pageSize: 24, direct: 'true' };

const LIST_VIEW_KEY = 'linknest:view-mode';
function loadViewMode(): 'list' | 'grid' | 'home' {
  try {
    const raw = localStorage.getItem(LIST_VIEW_KEY);
    if (raw === 'grid' || raw === 'home') return raw;
  } catch { /* ignore */ }
  return 'home';
}

function loadView(): BookmarkFilters {
  try {
    const raw = localStorage.getItem(VIEW_KEY);
    if (!raw) return defaultFilters;
    const saved: unknown = JSON.parse(raw);
    if (!saved || typeof saved !== 'object') return defaultFilters;
    const data = saved as Record<string, unknown>;
    const restored: BookmarkFilters = { ...defaultFilters, page: 1 };
    if (typeof data.collectionId === 'number' && data.collectionId >= 1 || data.collectionId === 'none') restored.collectionId = data.collectionId;
    if (typeof data.tag === 'string') restored.tag = data.tag;
    if (data.favorite === 'true' || data.favorite === 'false') restored.favorite = data.favorite;
    if (typeof data.sort === 'string' && (VALID_SORTS as readonly string[]).includes(data.sort)) restored.sort = data.sort as Sort;
    if (data.direct === 'true' || data.direct === 'false') restored.direct = data.direct;
    return restored;
  } catch {
    return defaultFilters;
  }
}

function pathToCategory(categories: Collection[], id: number): Collection[] {
  for (const category of categories) {
    if (category.id === id) return [category];
    const childPath = pathToCategory(category.children, id);
    if (childPath.length > 0) return [category, ...childPath];
  }
  return [];
}

function favoriteSubtreeCount(category: Collection): number {
  return category.children.reduce((sum, child) => sum + favoriteSubtreeCount(child), category.favoriteCount);
}

export default function App() {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [items, setItems] = useState<Bookmark[]>([]);
  const [total, setTotal] = useState(0);
  const [filters, setFilters] = useState<BookmarkFilters>(loadView);
  const [searchText, setSearchText] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [bookmarkDialog, setBookmarkDialog] = useState(false);
  const [editingBookmark, setEditingBookmark] = useState<Bookmark | null>(null);
  const [importDialog, setImportDialog] = useState(false);
  const [trashMode, setTrashMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [batchDialogMode, setBatchDialogMode] = useState<'move' | 'tags' | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'grid' | 'home'>(loadViewMode);
  const [tagManageOpen, setTagManageOpen] = useState(false);
  const [editingCollection, setEditingCollection] = useState<Collection | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const refreshTaxonomy = useCallback(async () => {
    try {
      const [nextCollections, nextTags, nextStats] = await Promise.all([api.collections(), api.tags(), api.stats()]);
      setCollections(nextCollections); setTags(nextTags); setStats(nextStats);
    } catch (reason) { setError(reason instanceof Error ? reason.message : '无法加载侧边栏数据'); }
  }, []);

  useEffect(() => { void refreshTaxonomy(); }, [refreshTaxonomy, refreshKey]);
  useEffect(() => { try { localStorage.setItem(VIEW_KEY, JSON.stringify({
    collectionId: filters.collectionId,
    tag: filters.tag,
    favorite: filters.favorite,
    sort: filters.sort,
    direct: filters.direct,
  })); } catch { /* 忽略 */ }
  }, [filters.collectionId, filters.tag, filters.favorite, filters.sort, filters.direct]);
  useEffect(() => {
    const timer = window.setTimeout(() => setFilters((old) => ({ ...old, q: searchText || undefined, direct: searchText ? undefined : 'true', page: 1 })), 300);
    return () => window.clearTimeout(timer);
  }, [searchText]);
  useEffect(() => {
    let active = true;
    setLoading(true); setError('');
    api.bookmarks(filters).then((result) => {
      if (!active) return;
      setItems(result.items); setTotal(result.total); setLoading(false);
    }).catch((reason) => {
      if (!active) return;
      setError(reason instanceof Error ? reason.message : '无法加载书签'); setLoading(false);
    });
    return () => { active = false; };
  }, [filters, refreshKey]);

  const updateFilters = (patch: Partial<BookmarkFilters>) => setFilters((old) => ({ ...old, ...patch, page: patch.page ?? 1 }));
  const refresh = () => setRefreshKey((value) => value + 1);
  const browsing = filters.direct === 'true';
  const favoriteMode = filters.favorite === 'true';
  // 是否处于根级首页（无任何筛选），用于决定是否可显示导航面板
  const atRoot = !filters.collectionId && !filters.tag && !filters.favorite && !filters.q && !trashMode;
  const breadcrumbTrail = useMemo(
    () => (typeof filters.collectionId === 'number' ? pathToCategory(collections, filters.collectionId) : []),
    [collections, filters.collectionId],
  );
  const rootLabel = favoriteMode ? '星标收藏' : filters.collectionId === 'none' ? '未分类' : '全部书签';
  const visibleCategories = useMemo(() => {
    if (!browsing || filters.collectionId === 'none') return [];
    const level = typeof filters.collectionId === 'number'
      ? (breadcrumbTrail.at(-1)?.children ?? [])
      : collections;
    return favoriteMode ? level.filter((category) => favoriteSubtreeCount(category) > 0) : level;
  }, [browsing, collections, breadcrumbTrail, filters.collectionId, favoriteMode]);
  const activeTitle = useMemo(() => {
    if (filters.q) return `搜索「${filters.q}」`;
    if (filters.tag) return `#${filters.tag}`;
    return breadcrumbTrail.at(-1)?.name ?? rootLabel;
  }, [filters.q, filters.tag, breadcrumbTrail, rootLabel]);
  const openNewBookmark = () => { setEditingBookmark(null); setBookmarkDialog(true); };
  const openEditBookmark = (bookmark: Bookmark) => { setEditingBookmark(bookmark); setBookmarkDialog(true); };
  const savedBookmark = () => { setBookmarkDialog(false); refresh(); };

  const createCollection = async (parentId: number | null) => {
    const name = window.prompt(parentId ? '新建子分类名称' : '新建分类名称');
    if (!name?.trim()) return;
    try { await api.createCollection({ name: name.trim(), parentId }); refresh(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '创建分类失败'); }
  };
  const renameCollection = (collection: Collection) => setEditingCollection(collection);
  const savedCollection = () => { setEditingCollection(null); refresh(); };
  const removeCollection = async (collection: Collection) => {
    if (!window.confirm(`删除分类「${collection.name}」？其中的书签将变为未分类，子分类会被上移。`)) return;
    try {
      await api.deleteCollection(collection.id);
      if (filters.collectionId === collection.id) updateFilters({ collectionId: collection.parentId ?? undefined, direct: 'true' });
      refresh();
    }
    catch (reason) { setError(reason instanceof Error ? reason.message : '删除分类失败'); }
  };
  const removeTag = async (tag: Tag) => {
    if (!window.confirm(`删除标签「${tag.name}」？书签本身不会删除。`)) return;
    try { await api.deleteTag(tag.id); if (filters.tag === tag.name) updateFilters({ tag: undefined }); refresh(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '删除标签失败'); }
  };
  const removeBookmark = async (bookmark: Bookmark) => {
    if (!window.confirm(`将「${bookmark.title}」移入回收站？可在 30 天内恢复。`)) return;
    try { await api.deleteBookmark(bookmark.id); refresh(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '删除书签失败'); }
  };
  const toggleFavorite = async (bookmark: Bookmark) => {
    try { await api.updateBookmark(bookmark.id, { isFavorite: !bookmark.isFavorite }); refresh(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '更新星标失败'); }
  };
  const refetchSingle = async (bookmark: Bookmark) => {
    try {
      const updated = await api.refetchBookmark(bookmark.id);
      setItems((prev) => prev.map((b) => (b.id === updated.id ? updated : b)));
    } catch (reason) { setError(reason instanceof Error ? reason.message : '重新抓取失败'); }
  };

  const selectedBookmark = useMemo(() => items.find((b) => selectedIds.has(b.id)), [items, selectedIds]);
  useEffect(() => { try { localStorage.setItem(LIST_VIEW_KEY, viewMode); } catch { /* ignore */ } }, [viewMode]);
  useEffect(() => { setSelectedIds(new Set()); }, [filters, trashMode]);
  useKeyboardShortcuts({
    onNew: openNewBookmark,
    onSearch: () => { searchInputRef.current?.focus(); },
    onEdit: () => { if (selectedBookmark) openEditBookmark(selectedBookmark); },
    onDelete: () => { if (selectedBookmark) removeBookmark(selectedBookmark); },
  });

  const toggleSelect = (id: number) => setSelectedIds((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const selectAll = () => setSelectedIds(new Set(items.map((b) => b.id)));
  const clearSelection = () => setSelectedIds(new Set());

  const batchMove = async (collectionId: number | null) => {
    try { await api.batchMoveBookmarks([...selectedIds], collectionId); clearSelection(); refresh(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '批量移动失败'); }
  };
  const batchAddTags = async (tags: string[]) => {
    try { await api.batchAddTags([...selectedIds], tags); clearSelection(); refresh(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '批量加标签失败'); }
  };
  const batchDelete = async () => {
    if (!window.confirm(`将 ${selectedIds.size} 条书签移入回收站？可在 30 天内恢复。`)) return;
    try { await api.batchDeleteBookmarks([...selectedIds]); clearSelection(); refresh(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '批量删除失败'); }
  };

  const exitTrash = () => { setTrashMode(false); };
  const pageCount = Math.max(1, Math.ceil(total / filters.pageSize));
  return <div className="app-shell">
    <Sidebar collections={collections} tags={tags} stats={stats} collectionId={filters.collectionId} tag={filters.tag} favorite={filters.favorite} trash={trashMode}
      onCollection={(collectionId) => { exitTrash(); setSearchText(''); updateFilters({ collectionId, q: undefined, tag: undefined, favorite: undefined, direct: 'true' }); }}
      onTag={(tag) => { exitTrash(); updateFilters({ tag, q: undefined, collectionId: undefined, favorite: undefined, direct: tag ? undefined : 'true' }); }}
      onFavorite={(favorite) => { exitTrash(); updateFilters({ favorite, q: undefined, collectionId: undefined, tag: undefined, direct: 'true' }); }}
      onTrash={() => { setTrashMode(true); setSearchText(''); setFilters(defaultFilters); }}
      onCreateCollection={createCollection} onRenameCollection={renameCollection} onDeleteCollection={removeCollection} onDeleteTag={removeTag} onManageTags={() => setTagManageOpen(true)}
      onDropBookmark={async (collectionId, bookmarkId) => {
        try { await api.updateBookmark(bookmarkId, { collectionId }); refresh(); }
        catch (reason) { setError(reason instanceof Error ? reason.message : '移动失败'); }
      }}
      onReorderCollection={async (parentId, orderedIds) => {
        try { await api.reorderCollections(parentId, orderedIds); refresh(); }
        catch (reason) { setError(reason instanceof Error ? reason.message : '排序失败'); }
      }} />
    <main className="main-content">
      {trashMode
        ? <TrashList onRestored={refresh} />
        : <>
          <Toolbar query={searchText} sort={filters.sort} total={total} view={viewMode} showHomeToggle={atRoot} onQueryChange={setSearchText} onSortChange={(sort) => updateFilters({ sort })} onAdd={openNewBookmark} onImport={() => setImportDialog(true)} onViewChange={setViewMode} searchInputRef={searchInputRef} />
          <section className="content-header">
            <div>
              <nav className="breadcrumb" aria-label="分类层级">
                <button onClick={() => updateFilters({ collectionId: undefined, tag: undefined })}>{rootLabel}</button>
                {breadcrumbTrail.map((category, index) => <span key={category.id} className="breadcrumb-step">
                  <span className="crumb-sep"> › </span>
                  {index === breadcrumbTrail.length - 1
                    ? <span className="crumb-current">{category.name}</span>
                    : <button onClick={() => updateFilters({ collectionId: category.id, tag: undefined })}>{category.name}</button>}
                </span>)}
              </nav>
              <h1>{activeTitle}</h1>
            </div>
            {(filters.tag || filters.q) && <button className="filter-reset" onClick={() => { setSearchText(''); updateFilters({ tag: undefined, q: undefined, direct: 'true' }); }}>返回层级浏览 ×</button>}
          </section>
          {error && <div className="error-banner"><span>!</span>{error}<button onClick={() => setError('')}>×</button></div>}
          {atRoot && viewMode === 'home'
            ? <HomePanel
                onVisit={(bookmark) => { void api.visitBookmark(bookmark.id).catch(() => undefined); }}
                onShowAll={openNewBookmark} />
            : viewMode === 'grid'
            ? <GridView bookmarks={items} categories={visibleCategories} browsing={browsing} favoriteMode={favoriteMode} loading={loading} selectedIds={selectedIds}
                onAdd={openNewBookmark} onEdit={openEditBookmark} onDelete={removeBookmark} onFavorite={toggleFavorite} onRefetch={refetchSingle}
                onTag={(tag) => updateFilters({ tag, direct: undefined })}
                onVisit={(bookmark) => { void api.visitBookmark(bookmark.id).catch(() => undefined); }}
                onOpenCategory={(category) => updateFilters({ collectionId: category.id, tag: undefined, direct: 'true' })}
                onToggleSelect={toggleSelect} />
            : <BookmarkList bookmarks={items} categories={visibleCategories} browsing={browsing} favoriteMode={favoriteMode} loading={loading} selectedIds={selectedIds}
                onAdd={openNewBookmark} onEdit={openEditBookmark} onDelete={removeBookmark} onFavorite={toggleFavorite} onRefetch={refetchSingle}
                onTag={(tag) => updateFilters({ tag, direct: undefined })}
                onVisit={(bookmark) => { void api.visitBookmark(bookmark.id).catch(() => undefined); }}
                onOpenCategory={(category) => updateFilters({ collectionId: category.id, tag: undefined, direct: 'true' })}
                onCreateCategory={createCollection} onRenameCategory={renameCollection} onDeleteCategory={removeCollection} onToggleSelect={toggleSelect} />
          }
          <BatchActionBar count={selectedIds.size} total={items.length} onMove={() => setBatchDialogMode('move')} onTags={() => setBatchDialogMode('tags')} onDelete={batchDelete} onClear={clearSelection} onSelectAll={selectAll} />
          <BatchDialog open={!!batchDialogMode} mode={batchDialogMode} collections={collections} onClose={() => setBatchDialogMode(null)} onMove={batchMove} onAddTags={batchAddTags} />
          {!loading && total > filters.pageSize && <nav className="pagination" aria-label="分页"><button disabled={filters.page <= 1} onClick={() => updateFilters({ page: filters.page - 1 })}>← 上一页</button><span>第 {filters.page} / {pageCount} 页</span><button disabled={filters.page >= pageCount} onClick={() => updateFilters({ page: filters.page + 1 })}>下一页 →</button></nav>}
        </>}
    </main>
    <BookmarkDialog open={bookmarkDialog} bookmark={editingBookmark} collections={collections} defaultCollectionId={typeof filters.collectionId === 'number' ? filters.collectionId : null} onClose={() => setBookmarkDialog(false)} onSaved={savedBookmark} />
    <CollectionDialog open={!!editingCollection} collection={editingCollection} collections={collections} onClose={() => setEditingCollection(null)} onSaved={savedCollection} />
    <TagManageDialog open={tagManageOpen} tags={tags} onClose={() => setTagManageOpen(false)} onChanged={refresh} />
    <ImportDialog open={importDialog} onClose={() => setImportDialog(false)} onImported={refresh} />
  </div>;
}
