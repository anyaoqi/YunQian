import type { Bookmark, Collection } from '../types';

type Props = {
  bookmarks: Bookmark[];
  categories: Collection[];
  browsing: boolean;
  favoriteMode: boolean;
  loading: boolean;
  onEdit: (bookmark: Bookmark) => void;
  onDelete: (bookmark: Bookmark) => void;
  onFavorite: (bookmark: Bookmark) => void;
  onVisit: (bookmark: Bookmark) => void;
  onTag: (tag: string) => void;
  onAdd: () => void;
  onOpenCategory: (category: Collection) => void;
  onCreateCategory: (parentId: number) => void;
  onRenameCategory: (category: Collection) => void;
  onDeleteCategory: (category: Collection) => void;
};

function domainOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}

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

export function BookmarkList(props: Props) {
  const { bookmarks, categories, browsing, favoriteMode, loading, onEdit, onDelete, onFavorite, onVisit, onTag, onAdd } = props;
  if (loading) return <div className="content-state"><span className="loader" />正在加载…</div>;
  if (bookmarks.length === 0 && categories.length === 0) return <div className="content-state empty-state">
    <div className="empty-icon">⌘</div><h2>这里还没有内容</h2><p>添加一个常用网址，或者导入浏览器已有的收藏。</p><button className="button primary" onClick={onAdd}>+ 添加第一条书签</button>
  </div>;
  return <div className="bookmark-list">
    {categories.map((category) => {
      const total = subtreeTotal(category, favoriteMode);
      return <article className="category-row" key={`category-${category.id}`}>
        <button className="category-open" onClick={() => props.onOpenCategory(category)} onDoubleClick={() => props.onRenameCategory(category)} title="点击进入该分类">
          <span className="category-icon">{category.icon ?? '📁'}</span>
          <span className="category-name">{category.name}</span>
          <span className="category-counts">
            {category.children.length > 0 && <span className="count-chip">{category.children.length} 个子分类</span>}
            <span className="count-chip">{total} 个网址</span>
          </span>
          <span className="category-enter">›</span>
        </button>
        <div className="category-actions">
          <button onClick={() => props.onCreateCategory(category.id)} title="在其中新建子分类">+</button>
          <button onClick={() => props.onRenameCategory(category)} title="重命名分类">✎</button>
          <button onClick={() => props.onDeleteCategory(category)} title="删除分类">×</button>
        </div>
      </article>;
    })}

    {bookmarks.map((bookmark) => <article className="bookmark-card" key={bookmark.id}>
      <div className="bookmark-icon">{bookmark.faviconUrl ? <img src={bookmark.faviconUrl} alt="" onError={(event) => { event.currentTarget.style.display = 'none'; }} /> : '↗'}</div>
      <div className="bookmark-body">
        <div className="bookmark-heading">
          <a href={bookmark.url} target="_blank" rel="noreferrer" onClick={() => onVisit(bookmark)}>{bookmark.title || domainOf(bookmark.url)}</a>
          <span className="domain">{domainOf(bookmark.url)}</span>
        </div>
        {(bookmark.description || bookmark.note) && <p className="bookmark-summary">{bookmark.note || bookmark.description}</p>}
        <div className="bookmark-meta">
          {!browsing && (bookmark.categoryPath.length > 0
            ? <span className="category-path" title={bookmark.categoryPath.join(' › ')}>▣ {bookmark.categoryPath.join(' › ')}</span>
            : <span className="category-path uncategorized">◌ 未分类</span>)}
          {bookmark.tags.map((tag) => <button key={tag} className="tag-chip" onClick={() => onTag(tag)}>#{tag}</button>)}
          <span className="date-chip">{relativeDate(bookmark.createdAt)}</span>
          {bookmark.clickCount > 0 && <span className="date-chip">↗ {bookmark.clickCount}</span>}
        </div>
      </div>
      <div className="bookmark-actions">
        <button className={bookmark.isFavorite ? 'favorite active' : 'favorite'} onClick={() => onFavorite(bookmark)} title={bookmark.isFavorite ? '取消星标' : '标记星标'}>★</button>
        <button onClick={() => onEdit(bookmark)} title="编辑">✎</button>
        <button onClick={() => onDelete(bookmark)} title="删除">×</button>
      </div>
    </article>)}
  </div>;
}
