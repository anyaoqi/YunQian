import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../api';
import type { Bookmark, BookmarkPayload, Collection } from '../types';

type Props = { open: boolean; bookmark: Bookmark | null; collections: Collection[]; defaultCollectionId: number | null; onClose: () => void; onSaved: () => void };
type FormState = { url: string; title: string; description: string; note: string; collectionId: string; tags: string; coverUrl: string; isFavorite: boolean };

const emptyForm: FormState = { url: '', title: '', description: '', note: '', collectionId: '', tags: '', coverUrl: '', isFavorite: false };
function flatten(collections: Collection[], prefix = ''): Array<{ id: number; label: string }> {
  return collections.flatMap((collection) => [{ id: collection.id, label: `${prefix}${collection.icon ?? '📁'} ${collection.name}` }, ...flatten(collection.children, `${prefix}　`)]);
}

export function BookmarkDialog({ open, bookmark, collections, defaultCollectionId, onClose, onSaved }: Props) {
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (open) {
      setError('');
      setForm(bookmark ? {
        url: bookmark.url, title: bookmark.title, description: bookmark.description ?? '', note: bookmark.note ?? '',
        collectionId: bookmark.collectionId?.toString() ?? '', tags: bookmark.tags.join(', '), coverUrl: bookmark.coverUrl ?? '', isFavorite: bookmark.isFavorite,
      } : { ...emptyForm, collectionId: defaultCollectionId?.toString() ?? '' });
    }
  }, [open, bookmark, defaultCollectionId]);
  if (!open) return null;
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((old) => ({ ...old, [key]: value }));
  const fetchTitle = async () => {
    if (!form.url.trim()) return;
    setFetching(true); setError('');
    try {
      const result = await api.fetchTitle(form.url);
      if (result.title && !form.title.trim()) set('title', result.title);
      if (result.description && !form.description.trim()) set('description', result.description);
      if (result.coverUrl && !form.coverUrl.trim()) set('coverUrl', result.coverUrl);
      if (!result.title) setError('未能抓取标题，请手动填写。');
    } catch (reason) { setError(reason instanceof Error ? reason.message : '标题抓取失败'); }
    finally { setFetching(false); }
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true); setError('');
    const payload: BookmarkPayload = {
      url: form.url, title: form.title, description: form.description || null, note: form.note || null,
      collectionId: form.collectionId ? Number(form.collectionId) : null, coverUrl: form.coverUrl || null,
      tags: form.tags.split(/[,，\n]/).map((tag) => tag.trim()).filter(Boolean), isFavorite: form.isFavorite,
    };
    try {
      if (bookmark) await api.updateBookmark(bookmark.id, payload); else await api.createBookmark(payload);
      onSaved();
    } catch (reason) { setError(reason instanceof Error ? reason.message : '保存失败'); }
    finally { setSaving(false); }
  };
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <form className="modal bookmark-dialog" onSubmit={submit}>
      <div className="modal-header"><div><span className="eyebrow">{bookmark ? '编辑收藏' : '新建收藏'}</span><h2>{bookmark ? '更新书签' : '添加书签'}</h2></div><button type="button" className="icon-close" onClick={onClose}>×</button></div>
      <label className="field"><span>网址 <b>*</b></span><div className="url-field"><input autoFocus required value={form.url} onChange={(event) => set('url', event.target.value)} placeholder="https://example.com" /><button type="button" onClick={fetchTitle} disabled={fetching || !form.url.trim()}>{fetching ? '抓取中…' : '抓取标题'}</button></div></label>
      <label className="field"><span>标题</span><input value={form.title} onChange={(event) => set('title', event.target.value)} placeholder="为空时将使用网址域名" /></label>
      <div className="two-fields"><label className="field"><span>归属分类</span><select value={form.collectionId} onChange={(event) => set('collectionId', event.target.value)}><option value="">未分类</option>{flatten(collections).map((collection) => <option key={collection.id} value={collection.id}>{collection.label}</option>)}</select></label><label className="field"><span>标签</span><input value={form.tags} onChange={(event) => set('tags', event.target.value)} placeholder="前端, 文档（逗号分隔）" /></label></div>
      <label className="field"><span>描述</span><input value={form.description} onChange={(event) => set('description', event.target.value)} placeholder="这个网址是什么？" /></label>
      <label className="field"><span>封面图 URL</span><input value={form.coverUrl} onChange={(event) => set('coverUrl', event.target.value)} placeholder="自动抓取或手动填写" /></label>
      <label className="field"><span>个人备注</span><textarea value={form.note} onChange={(event) => set('note', event.target.value)} placeholder="记录为什么收藏它，或者要点…" rows={3} /></label>
      <label className="favorite-check"><input type="checkbox" checked={form.isFavorite} onChange={(event) => set('isFavorite', event.target.checked)} /> <span>★ 加入星标收藏</span></label>
      {error && <p className="form-error">{error}</p>}
      <div className="modal-footer"><button type="button" className="button secondary" onClick={onClose}>取消</button><button className="button primary" disabled={saving}>{saving ? '保存中…' : '保存书签'}</button></div>
    </form>
  </div>;
}
