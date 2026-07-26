import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from './api';
import { BookmarkDialog } from './components/BookmarkDialog';
import { BookmarkList } from './components/BookmarkList';
import { ImportDialog } from './components/ImportDialog';
import { Sidebar } from './components/Sidebar';
import { Toolbar } from './components/Toolbar';
import type { Bookmark, BookmarkFilters, Collection, Stats, Tag } from './types';

const defaultFilters: BookmarkFilters = { sort: 'newest', page: 1, pageSize: 24 };

export default function App() {
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

  const refreshTaxonomy = useCallback(async () => {
    try {
      const [nextCollections, nextTags, nextStats] = await Promise.all([api.collections(), api.tags(), api.stats()]);
      setCollections(nextCollections); setTags(nextTags); setStats(nextStats);
    } catch (reason) { setError(reason instanceof Error ? reason.message : '无法加载侧边栏数据'); }
  }, []);

  useEffect(() => { void refreshTaxonomy(); }, [refreshTaxonomy, refreshKey]);
  useEffect(() => {
    const timer = window.setTimeout(() => setFilters((old) => ({ ...old, q: searchText || undefined, page: 1 })), 300);
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
  const activeTitle = useMemo(() => {
    if (filters.favorite === 'true') return '星标收藏';
    if (filters.collectionId === 'none') return '未分类';
    if (filters.tag) return `#${filters.tag}`;
    return filters.q ? `搜索「${filters.q}」` : '全部书签';
  }, [filters]);
  const openNewBookmark = () => { setEditingBookmark(null); setBookmarkDialog(true); };
  const openEditBookmark = (bookmark: Bookmark) => { setEditingBookmark(bookmark); setBookmarkDialog(true); };
  const savedBookmark = () => { setBookmarkDialog(false); refresh(); };

  const createCollection = async (parentId: number | null) => {
    const name = window.prompt(parentId ? '新建子集合名称' : '新建集合名称');
    if (!name?.trim()) return;
    try { await api.createCollection({ name: name.trim(), parentId }); refresh(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '创建集合失败'); }
  };
  const renameCollection = async (collection: Collection) => {
    const name = window.prompt('重命名集合', collection.name);
    if (!name?.trim() || name.trim() === collection.name) return;
    try { await api.updateCollection(collection.id, { name: name.trim() }); refresh(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '重命名集合失败'); }
  };
  const removeCollection = async (collection: Collection) => {
    if (!window.confirm(`删除集合「${collection.name}」？其中的书签将变为未分类，子集合会被上移。`)) return;
    try { await api.deleteCollection(collection.id); if (filters.collectionId === collection.id) updateFilters({ collectionId: undefined }); refresh(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '删除集合失败'); }
  };
  const removeTag = async (tag: Tag) => {
    if (!window.confirm(`删除标签「${tag.name}」？书签本身不会删除。`)) return;
    try { await api.deleteTag(tag.id); if (filters.tag === tag.name) updateFilters({ tag: undefined }); refresh(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '删除标签失败'); }
  };
  const removeBookmark = async (bookmark: Bookmark) => {
    if (!window.confirm(`删除「${bookmark.title}」？此操作不可恢复。`)) return;
    try { await api.deleteBookmark(bookmark.id); refresh(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '删除书签失败'); }
  };
  const toggleFavorite = async (bookmark: Bookmark) => {
    try { await api.updateBookmark(bookmark.id, { isFavorite: !bookmark.isFavorite }); refresh(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '更新星标失败'); }
  };

  const pageCount = Math.max(1, Math.ceil(total / filters.pageSize));
  return <div className="app-shell">
    <Sidebar collections={collections} tags={tags} stats={stats} collectionId={filters.collectionId} tag={filters.tag} favorite={filters.favorite}
      onCollection={(collectionId) => updateFilters({ collectionId })} onTag={(tag) => updateFilters({ tag })} onFavorite={(favorite) => updateFilters({ favorite })}
      onCreateCollection={createCollection} onRenameCollection={renameCollection} onDeleteCollection={removeCollection} onDeleteTag={removeTag} />
    <main className="main-content">
      <Toolbar query={searchText} sort={filters.sort} total={total} onQueryChange={setSearchText} onSortChange={(sort) => updateFilters({ sort })} onAdd={openNewBookmark} onImport={() => setImportDialog(true)} />
      <section className="content-header"><div><span className="eyebrow">你的网址知识库</span><h1>{activeTitle}</h1></div>{filters.tag && <button className="filter-reset" onClick={() => updateFilters({ tag: undefined })}>清除标签筛选 ×</button>}</section>
      {error && <div className="error-banner"><span>!</span>{error}<button onClick={() => setError('')}>×</button></div>}
      <BookmarkList bookmarks={items} loading={loading} onAdd={openNewBookmark} onEdit={openEditBookmark} onDelete={removeBookmark} onFavorite={toggleFavorite} onTag={(tag) => updateFilters({ tag })} onVisit={(bookmark) => { void api.visitBookmark(bookmark.id).catch(() => undefined); }} />
      {!loading && total > filters.pageSize && <nav className="pagination" aria-label="分页"><button disabled={filters.page <= 1} onClick={() => updateFilters({ page: filters.page - 1 })}>← 上一页</button><span>第 {filters.page} / {pageCount} 页</span><button disabled={filters.page >= pageCount} onClick={() => updateFilters({ page: filters.page + 1 })}>下一页 →</button></nav>}
    </main>
    <BookmarkDialog open={bookmarkDialog} bookmark={editingBookmark} collections={collections} onClose={() => setBookmarkDialog(false)} onSaved={savedBookmark} />
    <ImportDialog open={importDialog} onClose={() => setImportDialog(false)} onImported={refresh} />
  </div>;
}
