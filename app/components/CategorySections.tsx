'use client';

import { memo, useEffect, useMemo, useState } from 'react';
import { Folder, CircleDashed, ChevronRight, Star, RefreshCw, Pencil, X, Plus, Telescope } from 'lucide-react';
import type { Bookmark, Collection } from '@/lib/types';
import { buildCollectionIndex, pruneByFavorites, subtreeBookmarksFromIndex, subtreeTotal } from '@/lib/treeUtils';
import { Favicon, hostOf as domainOf } from './Favicon';

type CardCallbacks = {
  selectedIds: Set<number>;
  onEdit: (bookmark: Bookmark) => void;
  onDelete: (bookmark: Bookmark) => void;
  onFavorite: (bookmark: Bookmark) => void;
  onRefetch: (bookmark: Bookmark) => void;
  onVisit: (bookmark: Bookmark) => void;
  onToggleSelect: (id: number) => void;
};

type Props = CardCallbacks & {
  categories: Collection[];
  directBookmarks: Bookmark[];
  items: Bookmark[];
  directTitle: string;
  scopeKey: string;
  favoriteMode: boolean;
  loading: boolean;
  onAdd: () => void;
  onImport: () => void;
  onOpenCategory: (category: Collection) => void;
  onCreateCategory: (parentId: number) => void;
  onRenameCategory: (category: Collection) => void;
  onDeleteCategory: (category: Collection) => void;
  onDropBookmark: (collectionId: number, bookmarkId: number) => void;
};

/** 紧凑导航卡:favicon + 标题 + 一句描述,整卡访问,hover 浮现管理操作 */
const NavCard = memo(function NavCard({ bookmark, selectedIds, onEdit, onDelete, onFavorite, onRefetch, onVisit, onToggleSelect }: { bookmark: Bookmark } & CardCallbacks) {
  const title = bookmark.title || domainOf(bookmark.url);
  const summary = bookmark.description || bookmark.note || domainOf(bookmark.url);
  const selected = selectedIds.has(bookmark.id);
  return <article
    className={`nav-card ${selected ? 'selected' : ''}`}
    draggable
    onDragStart={(event) => { event.dataTransfer.setData('text/plain', String(bookmark.id)); event.dataTransfer.effectAllowed = 'move'; }}
  >
    <input type="checkbox" className="batch-checkbox nav-checkbox" checked={selected} onChange={() => onToggleSelect(bookmark.id)} aria-label={`选择 ${title}`} />
    <a className="nav-card-main" href={bookmark.url} target="_blank" rel="noreferrer" onClick={() => onVisit(bookmark)} title={bookmark.url}>
      <span className="nav-card-icon"><Favicon faviconUrl={bookmark.faviconUrl} url={bookmark.url} /></span>
      <span className="nav-card-body">
        <span className="nav-card-title">{title}</span>
        <span className="nav-card-desc">{summary}</span>
      </span>
    </a>
    {bookmark.isFavorite && <span className="nav-card-star" title="星标书签"><Star aria-hidden /></span>}
    <div className="nav-card-actions">
      <button className={`icon-btn favorite ${bookmark.isFavorite ? 'active' : ''}`} onClick={() => onFavorite(bookmark)} title={bookmark.isFavorite ? '取消星标' : '标记星标'} aria-label={bookmark.isFavorite ? '取消星标' : '标记星标'}><Star /></button>
      <button className="icon-btn" onClick={() => onRefetch(bookmark)} title="重新抓取封面与描述" aria-label="重新抓取"><RefreshCw /></button>
      <button className="icon-btn" onClick={() => onEdit(bookmark)} title="编辑" aria-label="编辑"><Pencil /></button>
      <button className="icon-btn danger" onClick={() => onDelete(bookmark)} title="删除" aria-label="删除"><X /></button>
    </div>
  </article>;
});

function NavGrid({ bookmarks, ...callbacks }: { bookmarks: Bookmark[] } & CardCallbacks) {
  return <div className="nav-grid">
    {bookmarks.map((bookmark) => <NavCard key={bookmark.id} bookmark={bookmark} {...callbacks} />)}
  </div>;
}

/** 当前 scope 直属书签区块(根 scope 时为未分类书签) */
function DirectSection({ title, bookmarks, ...callbacks }: { title: string; bookmarks: Bookmark[] } & CardCallbacks) {
  return <section className="cat-section cat-direct">
    <header className="cat-section-head">
      <div className="cat-section-title static">
        <span className="category-icon"><CircleDashed aria-hidden /></span>
        <h3>{title}</h3>
        <span className="chip mono">{bookmarks.length} 网址</span>
      </div>
    </header>
    <NavGrid bookmarks={bookmarks} {...callbacks} />
  </section>;
}

type SectionProps = CardCallbacks & {
  category: Collection;
  index: Map<number, Bookmark[]>;
  chip?: number | 'all';
  favoriteMode: boolean;
  onChipChange: (value: number | 'all') => void;
  onOpenCategory: (category: Collection) => void;
  onCreateCategory: (parentId: number) => void;
  onRenameCategory: (category: Collection) => void;
  onDeleteCategory: (category: Collection) => void;
  onDropBookmark: (collectionId: number, bookmarkId: number) => void;
};

/** 一个子分类区块:头部(下钻+管理) + 横向子导航 chips + 书签网格 */
function CategorySection(props: SectionProps) {
  const { category, index, chip, favoriteMode, onChipChange, onOpenCategory, onCreateCategory, onRenameCategory, onDeleteCategory, onDropBookmark, ...callbacks } = props;
  const [dragOver, setDragOver] = useState(false);
  const children = category.children;
  const total = subtreeTotal(category, favoriteMode);
  const selectedChild = typeof chip === 'number' ? children.find((child) => child.id === chip) : undefined;
  // 「全部」= 该分类子树全部书签;选中子 chip = 该子分类子树全部书签,均保持服务端排序
  const shown = useMemo(
    () => subtreeBookmarksFromIndex(selectedChild ?? category, index),
    [selectedChild, category, index],
  );
  return <section className="cat-section">
    <header
      className={`cat-section-head ${dragOver ? 'drag-over' : ''}`}
      onDragOver={(event) => { event.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragOver(false);
        const data = event.dataTransfer.getData('text/plain');
        if (data && !data.startsWith('collection:')) {
          const bookmarkId = Number(data);
          if (bookmarkId) onDropBookmark(category.id, bookmarkId);
        }
      }}
    >
      <button className="cat-section-title" onClick={() => onOpenCategory(category)} onDoubleClick={() => onRenameCategory(category)} title="点击进入该分类,双击编辑">
        <span className="category-icon">{category.icon ? <span aria-hidden>{category.icon}</span> : <Folder aria-hidden />}</span>
        <h3>{category.name}</h3>
        <span className="chip mono">{total} 网址</span>
        {children.length > 0 && <span className="chip mono">{children.length} 子集</span>}
        <ChevronRight className="cat-section-enter" aria-hidden />
      </button>
      <div className="cat-section-actions">
        <button className="icon-btn" onClick={() => onCreateCategory(category.id)} title="在其中新建子分类" aria-label="新建子分类"><Plus /></button>
        <button className="icon-btn" onClick={() => onRenameCategory(category)} title="编辑分类" aria-label="编辑分类"><Pencil /></button>
        <button className="icon-btn danger" onClick={() => onDeleteCategory(category)} title="删除分类" aria-label="删除分类"><X /></button>
      </div>
    </header>
    {children.length > 0 && (
      <div className="subnav-chips" role="tablist" aria-label={`「${category.name}」的子分类`}>
        <button role="tab" aria-selected={!selectedChild} className={`subnav-chip ${!selectedChild ? 'active' : ''}`} onClick={() => onChipChange('all')}>
          全部
        </button>
        {children.map((child) => <button
          key={child.id}
          role="tab"
          aria-selected={chip === child.id}
          className={`subnav-chip ${chip === child.id ? 'active' : ''}`}
          onClick={() => onChipChange(child.id)}
          title="筛选本区块内容"
        >
          {child.icon && <span aria-hidden>{child.icon}</span>}{child.name}
        </button>)}
      </div>
    )}
    {shown.length > 0
      ? <NavGrid bookmarks={shown} {...callbacks} />
      : <p className="cat-section-empty">{selectedChild ? `「${selectedChild.name}」下还没有书签` : '该分类下还没有书签'}</p>}
  </section>;
}

export function CategorySections(props: Props) {
  const { categories, directBookmarks, items, directTitle, scopeKey, favoriteMode, loading, onAdd, onImport,
    selectedIds, onEdit, onDelete, onFavorite, onRefetch, onVisit, onToggleSelect,
    onOpenCategory, onCreateCategory, onRenameCategory, onDeleteCategory, onDropBookmark } = props;
  // 每个区块选中的子导航 chip,切换 scope 后重置为「全部」
  const [chipSelection, setChipSelection] = useState<Record<number, number | 'all'>>({});
  useEffect(() => { setChipSelection({}); }, [scopeKey]);
  // 一次构建 collectionId → 书签 索引,各区块共享,替代每区块对全库的重复过滤
  const index = useMemo(() => buildCollectionIndex(items), [items]);

  if (loading) return <div className="content-state"><span className="loader" />正在加载…</div>;
  const visible = favoriteMode ? pruneByFavorites(categories) : categories;
  if (visible.length === 0 && directBookmarks.length === 0) return <div className="content-state empty-state">
    <div className="empty-mark"><Telescope aria-hidden /></div>
    <h2>这里还没有内容</h2>
    <p>添加一个常用网址,或导入浏览器已有的收藏。</p>
    <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
      <button type="button" className="button primary" onClick={onAdd}>添加书签</button>
      <button type="button" className="button secondary" onClick={onImport}>导入</button>
    </div>
  </div>;

  const callbacks = { selectedIds, onEdit, onDelete, onFavorite, onRefetch, onVisit, onToggleSelect };
  return <div className="cat-sections">
    {directBookmarks.length > 0 && <DirectSection title={directTitle} bookmarks={directBookmarks} {...callbacks} />}
    {visible.map((category) => <CategorySection
      key={category.id}
      category={category}
      index={index}
      chip={chipSelection[category.id]}
      favoriteMode={favoriteMode}
      onChipChange={(value) => setChipSelection((old) => ({ ...old, [category.id]: value }))}
      onOpenCategory={onOpenCategory}
      onCreateCategory={onCreateCategory}
      onRenameCategory={onRenameCategory}
      onDeleteCategory={onDeleteCategory}
      onDropBookmark={onDropBookmark}
      {...callbacks}
    />)}
  </div>;
}
