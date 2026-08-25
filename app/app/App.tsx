'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronLeft, ChevronRight, X, AlertCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { pathToCategory } from '@/lib/treeUtils';
import { BatchActionBar } from '@/components/BatchActionBar';
import { BatchDialog } from '@/components/BatchDialog';
import { BookmarkDialog } from '@/components/BookmarkDialog';
import { BookmarkList } from '@/components/BookmarkList';
import { CategorySections } from '@/components/CategorySections';
import { CollectionDialog } from '@/components/CollectionDialog';
import { CommandPalette } from '@/components/CommandPalette';
import { GridView } from '@/components/GridView';
import { HomePanel } from '@/components/HomePanel';
import { ImportDialog } from '@/components/ImportDialog';
import { Sidebar } from '@/components/Sidebar';
import { Toolbar } from '@/components/Toolbar';
import { TagManageDialog } from '@/components/TagManageDialog';
import { TrashList } from '@/components/TrashList';
import { ConfirmProvider, useConfirm } from '@/components/ui/ConfirmDialog';
import { ToastProvider, useToast } from '@/components/ui/Toast';
import { AuthProvider, useAuth } from '@/hooks/useAuth';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import type { Bookmark, BookmarkFilters, Collection, Sort, Stats, Tag } from '@/lib/types';

const VIEW_KEY = 'yunqian:view';
const VALID_SORTS = ['newest', 'oldest', 'title', 'popular'] as const;
const defaultFilters: BookmarkFilters = { sort: 'newest', page: 1, pageSize: 24, direct: 'true' };
const EASE = [0.2, 0, 0, 1] as const;

const LIST_VIEW_KEY = 'yunqian:view-mode';
const SIDEBAR_KEY = 'yunqian:sidebar-collapsed';
function parseViewMode(raw: string | null): 'list' | 'grid' | 'home' {
  if (raw === 'grid' || raw === 'home' || raw === 'list') return raw;
  return 'home';
}

function parseView(raw: string | null): BookmarkFilters {
  if (!raw) return defaultFilters;
  try {
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


export default function App() {
  return (
    <ToastProvider>
      <ConfirmProvider>
        <AppInner />
      </ConfirmProvider>
    </ToastProvider>
  );
}

function AppInner() {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [items, setItems] = useState<Bookmark[]>([]);
  const [total, setTotal] = useState(0);
  const [filters, setFilters] = useState<BookmarkFilters>(defaultFilters);
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
  const [viewMode, setViewMode] = useState<'list' | 'grid' | 'home'>('home');
  const [tagManageOpen, setTagManageOpen] = useState(false);
  const [collectionDialog, setCollectionDialog] = useState<{ collection: Collection | null; parentId: number | null } | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const confirm = useConfirm();
  const toast = useToast();
  const { user } = useAuth();

  const refreshTaxonomy = useCallback(async () => {
    try {
      const [nextCollections, nextTags, nextStats] = await Promise.all([api.collections(), api.tags(), api.stats()]);
      setCollections(nextCollections); setTags(nextTags); setStats(nextStats);
    } catch (reason) { setError(reason instanceof Error ? reason.message : '无法加载侧边栏数据'); }
  }, []);

  useEffect(() => { void refreshTaxonomy(); }, [refreshTaxonomy, refreshKey]);
  // 挂载后从 localStorage 恢复持久化状态,避免 SSR/客户端初始值不一致导致 hydration 不匹配
  useEffect(() => {
    try {
      setViewMode(parseViewMode(localStorage.getItem(LIST_VIEW_KEY)));
      setFilters(parseView(localStorage.getItem(VIEW_KEY)));
      setSidebarCollapsed(localStorage.getItem(SIDEBAR_KEY) === '1');
    } catch { /* ignore */ }
  }, []);
  useEffect(() => { try { localStorage.setItem(VIEW_KEY, JSON.stringify({
    collectionId: filters.collectionId,
    tag: filters.tag,
    favorite: filters.favorite,
    sort: filters.sort,
    direct: filters.direct,
  })); } catch { /* 忽略 */ }
  }, [filters.collectionId, filters.tag, filters.favorite, filters.sort, filters.direct]);
  useEffect(() => { try { localStorage.setItem(SIDEBAR_KEY, sidebarCollapsed ? '1' : '0'); } catch { /* 忽略 */ } }, [sidebarCollapsed]);
  useEffect(() => {
    const timer = window.setTimeout(() => setFilters((old) => ({ ...old, q: searchText || undefined, direct: searchText ? undefined : 'true', page: 1 })), 300);
    return () => window.clearTimeout(timer);
  }, [searchText]);
  const browsing = filters.direct === 'true';
  // 浏览模式(分区视图)一次拉取当前 scope 子树全部书签;搜索/标签筛选仍走分页
  const fetchFilters = useMemo(
    () => (browsing ? { ...filters, direct: undefined, all: 'true' as const } : filters),
    [filters, browsing],
  );
  useEffect(() => {
    let active = true;
    setLoading(true); setError('');
    api.bookmarks(fetchFilters).then((result) => {
      if (!active) return;
      setItems(result.items); setTotal(result.total); setLoading(false);
    }).catch((reason) => {
      if (!active) return;
      setError(reason instanceof Error ? reason.message : '无法加载书签'); setLoading(false);
    });
    return () => { active = false; };
  }, [fetchFilters, refreshKey]);

  // Ctrl/⌘ + K 命令面板
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const updateFilters = (patch: Partial<BookmarkFilters>) => setFilters((old) => ({ ...old, ...patch, page: patch.page ?? 1 }));
  const refresh = () => setRefreshKey((value) => value + 1);
  const favoriteMode = filters.favorite === 'true';
  // 是否处于根级首页(无任何筛选),用于决定是否可显示导航面板
  const atRoot = !filters.collectionId && !filters.tag && !filters.favorite && !filters.q && !trashMode;
  const breadcrumbTrail = useMemo(
    () => (typeof filters.collectionId === 'number' ? pathToCategory(collections, filters.collectionId) : []),
    [collections, filters.collectionId],
  );
  const rootLabel = favoriteMode ? '星标收藏' : filters.collectionId === 'none' ? '未分类' : '全部书签';
  const visibleCategories = useMemo(() => {
    if (!browsing || filters.collectionId === 'none') return [];
    return typeof filters.collectionId === 'number'
      ? (breadcrumbTrail.at(-1)?.children ?? [])
      : collections;
  }, [browsing, collections, breadcrumbTrail, filters.collectionId]);
  // 当前 scope 直属(未归入子分类)的书签:根/未分类 scope 取 collectionId 为 null,分类 scope 取其自身 id
  const scopeId = typeof filters.collectionId === 'number' ? filters.collectionId : null;
  const directItems = useMemo(() => items.filter((item) => item.collectionId === scopeId), [items, scopeId]);
  const directTitle = typeof filters.collectionId === 'number'
    ? `${breadcrumbTrail.at(-1)?.name ?? '当前分类'} · 直属`
    : '未分类';
  const activeTitle = useMemo(() => {
    if (filters.q) return `搜索「${filters.q}」`;
    if (filters.tag) return `#${filters.tag}`;
    return breadcrumbTrail.at(-1)?.name ?? rootLabel;
  }, [filters.q, filters.tag, breadcrumbTrail, rootLabel]);
  const openNewBookmark = () => { setEditingBookmark(null); setBookmarkDialog(true); };
  const openEditBookmark = (bookmark: Bookmark) => { setEditingBookmark(bookmark); setBookmarkDialog(true); };
  const savedBookmark = () => { setBookmarkDialog(false); refresh(); };

  const createCollection = (parentId: number | null) => setCollectionDialog({ collection: null, parentId });
  const renameCollection = (collection: Collection) => setCollectionDialog({ collection, parentId: null });
  const savedCollection = () => { setCollectionDialog(null); refresh(); };
  const removeCollection = async (collection: Collection) => {
    const ok = await confirm({
      title: '删除分类?',
      body: <>「<b>{collection.name}</b>」中的书签将变为未分类,子分类会上移。</>,
      confirmText: '删除',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.deleteCollection(collection.id);
      if (filters.collectionId === collection.id) updateFilters({ collectionId: collection.parentId ?? undefined, direct: 'true' });
      refresh();
      toast.push('success', '分类已删除');
    }
    catch (reason) { setError(reason instanceof Error ? reason.message : '删除分类失败'); }
  };
  const removeTag = async (tag: Tag) => {
    const ok = await confirm({
      title: '删除标签?',
      body: <>标签「<b>{tag.name}</b>」将被移除,书签本身不会删除。</>,
      confirmText: '删除',
      danger: true,
    });
    if (!ok) return;
    try { await api.deleteTag(tag.id); if (filters.tag === tag.name) updateFilters({ tag: undefined }); refresh(); toast.push('success', '标签已删除'); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '删除标签失败'); }
  };
  const removeBookmark = async (bookmark: Bookmark) => {
    const ok = await confirm({
      title: '移入回收站?',
      body: <>「<b>{bookmark.title || bookmark.url}</b>」将在回收站保留 30 天。</>,
      confirmText: '移入回收站',
      danger: true,
    });
    if (!ok) return;
    try { await api.deleteBookmark(bookmark.id); refresh(); toast.push('success', '已移入回收站'); }
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
      toast.push('success', '已重新抓取元数据');
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
    try { await api.batchMoveBookmarks([...selectedIds], collectionId); clearSelection(); refresh(); toast.push('success', '已移动所选书签'); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '批量移动失败'); }
  };
  const batchAddTags = async (newTags: string[]) => {
    try { await api.batchAddTags([...selectedIds], newTags); clearSelection(); refresh(); toast.push('success', '已添加标签'); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '批量加标签失败'); }
  };
  const batchDelete = async () => {
    const ok = await confirm({
      title: '批量删除?',
      body: <>所选 <b>{selectedIds.size}</b> 条书签将移入回收站,30 天内可恢复。</>,
      confirmText: '移入回收站',
      danger: true,
    });
    if (!ok) return;
    try { await api.batchDeleteBookmarks([...selectedIds]); clearSelection(); refresh(); toast.push('success', '已移入回收站'); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '批量删除失败'); }
  };

  const exitTrash = () => { setTrashMode(false); };
  const pageCount = Math.max(1, Math.ceil(total / filters.pageSize));
  const homeActive = atRoot && viewMode === 'home';
  const viewKey = trashMode ? 'trash' : homeActive ? 'home' : browsing ? 'browse' : viewMode;

  const visit = (bookmark: Bookmark) => { void api.visitBookmark(bookmark.id).catch(() => undefined); };

  return <div className={`app-shell ${sidebarCollapsed ? 'collapsed' : ''}`}>
    <Sidebar collections={collections} tags={tags} stats={stats} collectionId={filters.collectionId} tag={filters.tag} favorite={filters.favorite} trash={trashMode}
      collapsed={sidebarCollapsed} onToggleCollapse={() => setSidebarCollapsed((v) => !v)}
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
          <Toolbar query={searchText} sort={filters.sort} view={viewMode} showHomeToggle={atRoot} showViewToggle={!browsing || homeActive} onQueryChange={setSearchText} onSortChange={(sort) => updateFilters({ sort })} onAdd={openNewBookmark} onImport={() => setImportDialog(true)} onOpenPalette={() => setPaletteOpen(true)} onViewChange={setViewMode} searchInputRef={searchInputRef} />
          {!homeActive && <section className="content-header">
            <div>
              <nav className="breadcrumb" aria-label="分类层级">
                <button onClick={() => updateFilters({ collectionId: undefined, tag: undefined })}>{rootLabel}</button>
                {breadcrumbTrail.map((category, index) => <span key={category.id} className="breadcrumb-step">
                  <span className="crumb-sep" aria-hidden>›</span>
                  {index === breadcrumbTrail.length - 1
                    ? <span className="crumb-current">{category.name}</span>
                    : <button onClick={() => updateFilters({ collectionId: category.id, tag: undefined })}>{category.name}</button>}
                </span>)}
              </nav>
              <h1>{activeTitle}<span className="header-count">{total} 条</span></h1>
            </div>
            {(filters.tag || filters.q) && <button className="filter-reset" onClick={() => { setSearchText(''); updateFilters({ tag: undefined, q: undefined, direct: 'true' }); }}><X aria-hidden />返回层级浏览</button>}
          </section>}
          {error && <div className="error-banner"><AlertCircle aria-hidden />{error}<button className="icon-btn" onClick={() => setError('')} aria-label="关闭错误"><X /></button></div>}
          {user?.isDefaultPassword && (
            <div className="error-banner" style={{ background: 'var(--accent-soft)', color: 'var(--accent)', borderColor: 'var(--accent)' }}>
              <AlertCircle aria-hidden />
              <span>当前正在使用初始默认管理员密码（admin123），建议前往左下角用户菜单「修改密码」以确保账户安全。</span>
            </div>
          )}
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={viewKey}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.18, ease: EASE }}
            >
              {homeActive
                ? <HomePanel onVisit={visit} onAdd={openNewBookmark} onImport={() => setImportDialog(true)} />
                : browsing
                ? <CategorySections
                    categories={visibleCategories}
                    directBookmarks={directItems}
                    items={items}
                    directTitle={directTitle}
                    scopeKey={typeof filters.collectionId === 'number' ? String(filters.collectionId) : filters.collectionId ?? 'root'}
                    favoriteMode={favoriteMode}
                    loading={loading}
                    selectedIds={selectedIds}
                    onAdd={openNewBookmark}
                    onImport={() => setImportDialog(true)}
                    onEdit={openEditBookmark}
                    onDelete={removeBookmark}
                    onFavorite={toggleFavorite}
                    onRefetch={refetchSingle}
                    onVisit={visit}
                    onToggleSelect={toggleSelect}
                    onOpenCategory={(category) => updateFilters({ collectionId: category.id, tag: undefined, direct: 'true' })}
                    onCreateCategory={createCollection}
                    onRenameCategory={renameCollection}
                    onDeleteCategory={removeCollection}
                    onDropBookmark={async (collectionId, bookmarkId) => {
                      try { await api.updateBookmark(bookmarkId, { collectionId }); refresh(); }
                      catch (reason) { setError(reason instanceof Error ? reason.message : '移动失败'); }
                    }}
                  />
                : viewMode === 'grid'
                ? <GridView bookmarks={items} categories={visibleCategories} browsing={browsing} favoriteMode={favoriteMode} loading={loading} selectedIds={selectedIds}
                    onAdd={openNewBookmark} onImport={() => setImportDialog(true)} onEdit={openEditBookmark} onDelete={removeBookmark} onFavorite={toggleFavorite} onRefetch={refetchSingle}
                    onTag={(tag) => updateFilters({ tag, direct: undefined })}
                    onVisit={visit}
                    onOpenCategory={(category) => updateFilters({ collectionId: category.id, tag: undefined, direct: 'true' })}
                    onToggleSelect={toggleSelect} />
                : <BookmarkList bookmarks={items} categories={visibleCategories} browsing={browsing} favoriteMode={favoriteMode} loading={loading} selectedIds={selectedIds}
                    onAdd={openNewBookmark} onImport={() => setImportDialog(true)} onEdit={openEditBookmark} onDelete={removeBookmark} onFavorite={toggleFavorite} onRefetch={refetchSingle}
                    onTag={(tag) => updateFilters({ tag, direct: undefined })}
                    onVisit={visit}
                    onOpenCategory={(category) => updateFilters({ collectionId: category.id, tag: undefined, direct: 'true' })}
                    onCreateCategory={createCollection} onRenameCategory={renameCollection} onDeleteCategory={removeCollection} onToggleSelect={toggleSelect} />
              }
            </motion.div>
          </AnimatePresence>
          <BatchActionBar count={selectedIds.size} total={items.length} onMove={() => setBatchDialogMode('move')} onTags={() => setBatchDialogMode('tags')} onDelete={batchDelete} onClear={clearSelection} onSelectAll={selectAll} />
          <BatchDialog open={!!batchDialogMode} mode={batchDialogMode} collections={collections} onClose={() => setBatchDialogMode(null)} onMove={batchMove} onAddTags={batchAddTags} />
          {!loading && !browsing && total > filters.pageSize && <nav className="pagination" aria-label="分页">
            <button disabled={filters.page <= 1} onClick={() => updateFilters({ page: filters.page - 1 })}><ChevronLeft aria-hidden />上一页</button>
            <span className="mono">第 {filters.page} / {pageCount} 页</span>
            <button disabled={filters.page >= pageCount} onClick={() => updateFilters({ page: filters.page + 1 })}>下一页<ChevronRight aria-hidden /></button>
          </nav>}
        </>}
    </main>
    <BookmarkDialog open={bookmarkDialog} bookmark={editingBookmark} collections={collections} defaultCollectionId={typeof filters.collectionId === 'number' ? filters.collectionId : null} onClose={() => setBookmarkDialog(false)} onSaved={savedBookmark} />
    <CollectionDialog open={!!collectionDialog} collection={collectionDialog?.collection ?? null} defaultParentId={collectionDialog?.parentId ?? null} collections={collections} onClose={() => setCollectionDialog(null)} onSaved={savedCollection} />
    <TagManageDialog open={tagManageOpen} tags={tags} onClose={() => setTagManageOpen(false)} onChanged={refresh} />
    <ImportDialog open={importDialog} onClose={() => setImportDialog(false)} onImported={refresh} />
    <CommandPalette
      open={paletteOpen}
      collections={collections}
      onClose={() => setPaletteOpen(false)}
      onAdd={openNewBookmark}
      onImport={() => setImportDialog(true)}
      onAll={() => { exitTrash(); setSearchText(''); setFilters({ ...defaultFilters }); }}
      onFavorites={() => { exitTrash(); setSearchText(''); updateFilters({ favorite: 'true', q: undefined, collectionId: undefined, tag: undefined, direct: 'true' }); }}
      onTrash={() => { setTrashMode(true); setSearchText(''); setFilters(defaultFilters); }}
      onCollection={(id) => { exitTrash(); setSearchText(''); updateFilters({ collectionId: id, q: undefined, tag: undefined, favorite: undefined, direct: 'true' }); }}
      onVisit={visit}
    />
  </div>;
}
