import { useEffect, useState } from 'react';
import { api } from '../api';
import type { TrashedBookmark } from '../types';
import { Favicon, hostOf as domainOf } from './Favicon';

type Props = {
  onRestored: () => void;
};

function relativeDate(value: string): string {
  const date = new Date(value);
  return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date);
}

export function TrashList({ onRestored }: Props) {
  const [items, setItems] = useState<TrashedBookmark[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const data = await api.trash();
      setItems(data);
      setError('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '加载回收站失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const restore = async (bookmark: TrashedBookmark) => {
    try {
      await api.restoreBookmark(bookmark.id);
      await load();
      onRestored();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '恢复失败');
    }
  };

  const remove = async (bookmark: TrashedBookmark) => {
    if (!window.confirm(`永久删除「${bookmark.title}」？此操作不可恢复。`)) return;
    try {
      await api.permanentlyDeleteBookmark(bookmark.id);
      await load();
      onRestored();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '删除失败');
    }
  };

  const empty = async () => {
    if (!window.confirm('清空回收站？所有项目将被永久删除。')) return;
    try {
      await api.emptyTrash();
      await load();
      onRestored();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '清空失败');
    }
  };

  if (loading) return <div className="content-state"><span className="loader" />正在加载…</div>;

  return <div className="trash-view">
    <div className="content-header">
      <div>
        <span className="eyebrow">回收站</span>
        <h1>已删除的书签</h1>
      </div>
      {items.length > 0 && <button className="button danger" onClick={empty}>清空回收站</button>}
    </div>
    {error && <div className="error-banner"><span>!</span>{error}<button onClick={() => setError('')}>×</button></div>}
    {items.length === 0
      ? <div className="content-state empty-state"><div className="empty-icon">🗑</div><h2>回收站是空的</h2><p>删除的书签会在这里保留 30 天。</p></div>
      : <div className="bookmark-list">
          {items.map((bookmark) => <article className="bookmark-card trashed" key={bookmark.id}>
            <div className="bookmark-icon"><Favicon faviconUrl={bookmark.faviconUrl} url={bookmark.url} /></div>
            <div className="bookmark-body">
              <div className="bookmark-heading">
                <a href={bookmark.url} target="_blank" rel="noreferrer">{bookmark.title || domainOf(bookmark.url)}</a>
                <span className="domain">{domainOf(bookmark.url)}</span>
              </div>
              <div className="bookmark-meta">
                <span className="date-chip">删除于 {relativeDate(bookmark.deletedAt)}</span>
                {bookmark.categoryPath.length > 0 && <span className="category-path">▣ {bookmark.categoryPath.join(' › ')}</span>}
                {bookmark.tags.map((tag) => <span key={tag} className="tag-chip">#{tag}</span>)}
              </div>
            </div>
            <div className="bookmark-actions">
              <button onClick={() => restore(bookmark)} title="恢复"> 恢复</button>
              <button onClick={() => remove(bookmark)} title="永久删除">×</button>
            </div>
          </article>)}
        </div>}
  </div>;
}
