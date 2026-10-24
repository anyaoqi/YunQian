'use client';

import { useEffect, useState } from 'react';
import { RotateCcw, X, Trash2, AlertCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { useConfirm } from './ui/ConfirmDialog';
import { Favicon, hostOf as domainOf } from './Favicon';
import type { TrashedBookmark } from '@/lib/types';

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
  const [busy, setBusy] = useState(false);
  const confirm = useConfirm();

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
    if (busy) return;
    setBusy(true);
    try {
      await api.restoreBookmark(bookmark.id);
      await load();
      onRestored();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '恢复失败');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (bookmark: TrashedBookmark) => {
    if (busy) return;
    const ok = await confirm({
      title: '永久删除?',
      body: <>「<b>{bookmark.title || domainOf(bookmark.url)}</b>」将被永久删除,此操作不可恢复。</>,
      confirmText: '永久删除',
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await api.permanentlyDeleteBookmark(bookmark.id);
      await load();
      onRestored();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '删除失败');
    } finally {
      setBusy(false);
    }
  };

  const empty = async () => {
    if (busy) return;
    const ok = await confirm({
      title: '清空回收站?',
      body: <>全部 <b>{items.length}</b> 项将被永久删除,不可恢复。</>,
      confirmText: '清空',
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await api.emptyTrash();
      await load();
      onRestored();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '清空失败');
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div className="content-state"><span className="loader" />正在加载…</div>;

  return <div className="trash-view">
    <div className="trash-head">
      <h1>回收站</h1>
      {items.length > 0 && <button className="button danger" onClick={empty} disabled={busy}><Trash2 aria-hidden />清空回收站</button>}
    </div>
    {error && <div className="error-banner"><AlertCircle aria-hidden />{error}<button className="icon-btn" onClick={() => setError('')} aria-label="关闭错误"><X /></button></div>}
    {items.length === 0
      ? <div className="content-state empty-state"><div className="empty-mark"><Trash2 aria-hidden /></div><h2>回收站是空的</h2><p>删除的书签会在这里保留 30 天。</p></div>
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
                {bookmark.categoryPath.length > 0 && <span className="chip category-path">{bookmark.categoryPath.join(' / ')}</span>}
                {bookmark.tags.map((tag) => <span key={tag} className="chip">#{tag}</span>)}
              </div>
            </div>
            <div className="bookmark-actions">
              <button className="icon-btn trash-restore-btn" onClick={() => restore(bookmark)} title="恢复" aria-label="恢复" disabled={busy}><RotateCcw /></button>
              <button className="icon-btn danger" onClick={() => remove(bookmark)} title="永久删除" aria-label="永久删除" disabled={busy}><X /></button>
            </div>
          </article>)}
        </div>}
  </div>;
}
