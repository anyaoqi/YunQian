'use client';

import { Folder, Star, RefreshCw, Pencil, X, Telescope } from 'lucide-react';
import type { Bookmark, Collection } from '@/lib/types';
import { subtreeTotal } from '@/lib/treeUtils';
import { Favicon, hostOf as domainOf } from './Favicon';

type Props = {
  bookmarks: Bookmark[];
  categories: Collection[];
  browsing: boolean;
  favoriteMode: boolean;
  loading: boolean;
  selectedIds: Set<number>;
  query?: string;
  onEdit: (bookmark: Bookmark) => void;
  onDelete: (bookmark: Bookmark) => void;
  onFavorite: (bookmark: Bookmark) => void;
  onRefetch: (bookmark: Bookmark) => void;
  onVisit: (bookmark: Bookmark) => void;
  onTag: (tag: string) => void;
  onAdd: () => void;
  onImport: () => void;
  onOpenCategory: (category: Collection) => void;
  onToggleSelect: (id: number) => void;
};

function relativeDate(value: string): string {
  const days = Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000);
  if (days <= 0) return '今天';
  if (days === 1) return '昨天';
  if (days < 30) return `${days} 天前`;
  return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(value));
}


export function GridView(props: Props) {
  const { bookmarks, categories, browsing, favoriteMode, loading, onEdit, onDelete, onFavorite, onRefetch, onVisit, onTag, onAdd, onImport, onOpenCategory, selectedIds, onToggleSelect, query } = props;
  if (loading) return <div className="content-state"><span className="loader" />正在加载…</div>;
  if (bookmarks.length === 0 && categories.length === 0) return <div className="content-state empty-state">
    <div className="empty-mark"><Telescope aria-hidden /></div>
    {query
      ? <><h2>没有匹配「{query}」的书签</h2><p>换个关键词试试,或清空搜索返回层级浏览。</p></>
      : <><h2>这里还没有内容</h2><p>添加一个常用网址,或导入浏览器已有的收藏。</p></>}
    {!query && <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
      <button type="button" className="button primary" onClick={onAdd}>添加书签</button>
      <button type="button" className="button secondary" onClick={onImport}>导入</button>
    </div>}
  </div>;
  return <div className="content-stack">
    {categories.length > 0 && (
      <section className="content-section">
        <header className="content-section-head"><h3>分类</h3><small>{categories.length}</small></header>
        <div className="category-grid">
          {categories.map((category) => {
            const total = subtreeTotal(category, favoriteMode);
            return <article className="category-card" key={`category-${category.id}`}>
              <button className="category-card-open" onClick={() => onOpenCategory(category)}>
                <span className="category-card-cover">{category.icon ? <span aria-hidden>{category.icon}</span> : <Folder aria-hidden />}</span>
                <span className="category-card-body">
                  <span className="category-name">{category.name}</span>
                  <span className="chip mono">{total} 网址</span>
                </span>
              </button>
            </article>;
          })}
        </div>
      </section>
    )}
    {bookmarks.length > 0 && (
      <section className="content-section">
        <header className="content-section-head"><h3>书签</h3><small>{bookmarks.length}</small></header>
        <div className="grid-view">
          {bookmarks.map((bookmark) => <article className={`grid-card ${selectedIds.has(bookmark.id) ? 'selected' : ''}`} key={bookmark.id}
            draggable
            onDragStart={(event) => { event.dataTransfer.setData('text/plain', String(bookmark.id)); event.dataTransfer.effectAllowed = 'move'; }}
          >
            <input type="checkbox" className="batch-checkbox grid-checkbox" checked={selectedIds.has(bookmark.id)} onChange={() => onToggleSelect(bookmark.id)} aria-label={`选择 ${bookmark.title || domainOf(bookmark.url)}`} />
            <a className="grid-cover" href={bookmark.url} target="_blank" rel="noreferrer" onClick={() => onVisit(bookmark)}>
              {bookmark.coverUrl
                ? <img src={bookmark.coverUrl} alt="" loading="lazy" decoding="async" />
                : <div className="grid-cover-placeholder"><Favicon faviconUrl={bookmark.faviconUrl} url={bookmark.url} /></div>}
            </a>
            <div className="grid-body">
              <div className="grid-title"><a href={bookmark.url} target="_blank" rel="noreferrer" onClick={() => onVisit(bookmark)}>{bookmark.title || domainOf(bookmark.url)}</a></div>
              <div className="grid-domain">{domainOf(bookmark.url)}</div>
              {bookmark.description && <p className="grid-desc">{bookmark.description}</p>}
              <div className="grid-meta">
                {!browsing && (bookmark.categoryPath.length > 0
                  ? <span className="chip category-path" title={bookmark.categoryPath.join(' / ')}>{bookmark.categoryPath.join(' / ')}</span>
                  : <span className="chip">未分类</span>)}
                {bookmark.tags.slice(0, 3).map((tag) => <button key={tag} className="chip" onClick={() => onTag(tag)}>#{tag}</button>)}
                <span className="date-chip">{relativeDate(bookmark.createdAt)}</span>
              </div>
            </div>
            <div className="grid-actions">
              <button className={`icon-btn favorite ${bookmark.isFavorite ? 'active' : ''}`} onClick={() => onFavorite(bookmark)} title={bookmark.isFavorite ? '取消星标' : '标记星标'} aria-label={bookmark.isFavorite ? '取消星标' : '标记星标'}><Star /></button>
              <button className="icon-btn" onClick={() => onRefetch(bookmark)} title="重新抓取封面与描述" aria-label="重新抓取"><RefreshCw /></button>
              <button className="icon-btn" onClick={() => onEdit(bookmark)} title="编辑" aria-label="编辑"><Pencil /></button>
              <button className="icon-btn danger" onClick={() => onDelete(bookmark)} title="删除" aria-label="删除"><X /></button>
            </div>
          </article>)}
        </div>
      </section>
    )}
  </div>;
}
