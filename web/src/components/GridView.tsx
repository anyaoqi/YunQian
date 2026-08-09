import type { Bookmark, Collection } from '../types';
import { Favicon, hostOf as domainOf } from './Favicon';
import { Logo } from './Logo';

type Props = {
  bookmarks: Bookmark[];
  categories: Collection[];
  browsing: boolean;
  favoriteMode: boolean;
  loading: boolean;
  selectedIds: Set<number>;
  onEdit: (bookmark: Bookmark) => void;
  onDelete: (bookmark: Bookmark) => void;
  onFavorite: (bookmark: Bookmark) => void;
  onRefetch: (bookmark: Bookmark) => void;
  onVisit: (bookmark: Bookmark) => void;
  onTag: (tag: string) => void;
  onAdd: () => void;
  onOpenCategory: (category: Collection) => void;
  onToggleSelect: (id: number) => void;
};

function relativeDate(value: string): string {
  const days = Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000);
  if (days <= 0) return '今天添加';
  if (days === 1) return '昨天添加';
  if (days < 30) return `${days} 天前添加`;
  return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(value));
}

function subtreeTotal(category: Collection, favoriteMode: boolean): number {
  const own = favoriteMode ? category.favoriteCount : category.bookmarkCount;
  return category.children.reduce((sum, child) => sum + subtreeTotal(child, favoriteMode), own);
}

export function GridView(props: Props) {
  const { bookmarks, categories, browsing, favoriteMode, loading, selectedIds, onEdit, onDelete, onFavorite, onRefetch, onVisit, onTag, onAdd, onOpenCategory, onToggleSelect } = props;
  if (loading) return <div className="content-state"><span className="loader" />正在加载…</div>;
  if (bookmarks.length === 0 && categories.length === 0) return <div className="content-state empty-state">
    <div className="empty-icon"><Logo size={36} /></div><h2>这里还没有内容</h2><p>添加一个常用网址，或者导入浏览器已有的收藏。</p><button className="button primary" onClick={onAdd}>+ 添加第一条书签</button>
  </div>;
  return <div className="content-stack">
    {categories.length > 0 && (
      <section className="content-section">
        <header className="content-section-head"><h3>分类</h3><small>{categories.length}</small></header>
        <div className="bookmark-list">
          {categories.map((category) => {
            const total = subtreeTotal(category, favoriteMode);
            return <article className="category-row" key={`category-${category.id}`}>
              <button className="category-open" onClick={() => onOpenCategory(category)}>
                <span className="category-icon">{category.icon ?? '📁'}</span>
                <span className="category-name">{category.name}</span>
                <span className="category-counts"><span className="count-chip">{total} 个网址</span></span>
                <span className="category-enter">›</span>
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
            <input type="checkbox" className="batch-checkbox grid-checkbox" checked={selectedIds.has(bookmark.id)} onChange={() => onToggleSelect(bookmark.id)} aria-label="选择" />
            <a className="grid-cover" href={bookmark.url} target="_blank" rel="noreferrer" onClick={() => onVisit(bookmark)}>
              {bookmark.coverUrl ? <img src={bookmark.coverUrl} alt="" /> : <div className="grid-cover-placeholder"><Favicon faviconUrl={bookmark.faviconUrl} url={bookmark.url} /></div>}
            </a>
            <div className="grid-body">
              <div className="grid-title"><a href={bookmark.url} target="_blank" rel="noreferrer" onClick={() => onVisit(bookmark)}>{bookmark.title || domainOf(bookmark.url)}</a></div>
              <div className="grid-domain">{domainOf(bookmark.url)}</div>
              {bookmark.description && <p className="grid-desc">{bookmark.description}</p>}
              <div className="grid-meta">
                {!browsing && (bookmark.categoryPath.length > 0
                  ? <span className="category-path" title={bookmark.categoryPath.join(' › ')}>▣ {bookmark.categoryPath.join(' › ')}</span>
                  : <span className="category-path uncategorized">◌ 未分类</span>)}
                {bookmark.tags.slice(0, 3).map((tag) => <button key={tag} className="tag-chip" onClick={() => onTag(tag)}>#{tag}</button>)}
                <span className="date-chip">{relativeDate(bookmark.createdAt)}</span>
              </div>
            </div>
            <div className="grid-actions">
              <button className={bookmark.isFavorite ? 'favorite active' : 'favorite'} onClick={() => onFavorite(bookmark)} title={bookmark.isFavorite ? '取消星标' : '标记星标'}>★</button>
              <button onClick={() => onRefetch(bookmark)} title="重新抓取封面与描述">↻</button>
              <button onClick={() => onEdit(bookmark)} title="编辑">✎</button>
              <button onClick={() => onDelete(bookmark)} title="删除">×</button>
            </div>
          </article>)}
        </div>
      </section>
    )}
  </div>;
}
