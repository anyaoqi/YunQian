import type { Bookmark } from '../types';

type Props = {
  bookmarks: Bookmark[];
  loading: boolean;
  onEdit: (bookmark: Bookmark) => void;
  onDelete: (bookmark: Bookmark) => void;
  onFavorite: (bookmark: Bookmark) => void;
  onVisit: (bookmark: Bookmark) => void;
  onTag: (tag: string) => void;
  onAdd: () => void;
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

export function BookmarkList({ bookmarks, loading, onEdit, onDelete, onFavorite, onVisit, onTag, onAdd }: Props) {
  if (loading) return <div className="content-state"><span className="loader" />正在加载书签…</div>;
  if (bookmarks.length === 0) return <div className="content-state empty-state">
    <div className="empty-icon">⌘</div><h2>这里还没有书签</h2><p>添加一个常用网址，或者导入浏览器已有的收藏。</p><button className="button primary" onClick={onAdd}>+ 添加第一条书签</button>
  </div>;
  return <div className="bookmark-list">
    {bookmarks.map((bookmark) => <article className="bookmark-card" key={bookmark.id}>
      <div className="bookmark-icon">{bookmark.faviconUrl ? <img src={bookmark.faviconUrl} alt="" onError={(event) => { event.currentTarget.style.display = 'none'; }} /> : '↗'}</div>
      <div className="bookmark-body">
        <div className="bookmark-heading">
          <a href={bookmark.url} target="_blank" rel="noreferrer" onClick={() => onVisit(bookmark)}>{bookmark.title || domainOf(bookmark.url)}</a>
          <span className="domain">{domainOf(bookmark.url)}</span>
        </div>
        {(bookmark.description || bookmark.note) && <p className="bookmark-summary">{bookmark.note || bookmark.description}</p>}
        <div className="bookmark-meta">
          {bookmark.collectionName && <span className="collection-chip">▣ {bookmark.collectionName}</span>}
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
