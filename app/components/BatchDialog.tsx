'use client';

import { useEffect, useState } from 'react';
import { Modal } from './ui/Modal';
import type { Collection } from '@/lib/types';

type Mode = 'move' | 'tags' | null;

type Props = {
  open: boolean;
  mode: Mode;
  collections: Collection[];
  onClose: () => void;
  onMove: (collectionId: number | null) => Promise<void>;
  onAddTags: (tags: string[]) => Promise<void>;
};

function flattenCollections(collections: Collection[]): Collection[] {
  return collections.flatMap((c) => [c, ...flattenCollections(c.children)]);
}

export function BatchDialog({ open, mode, collections, onClose, onMove, onAddTags }: Props) {
  const [collectionId, setCollectionId] = useState<number | 'none' | ''>('');
  const [tagInput, setTagInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // 每次打开重置选择与错误,不保留上次的残留状态
  useEffect(() => {
    if (open) { setCollectionId(''); setTagInput(''); setBusy(false); setError(''); }
  }, [open]);

  const handleMove = async () => {
    if (collectionId === '' || busy) return;
    setBusy(true); setError('');
    try {
      await onMove(collectionId === 'none' ? null : collectionId);
      setCollectionId('');
      onClose();
    } catch (reason) {
      // 失败时保持对话框打开,就地提示,而不是只留主区 banner
      setError(reason instanceof Error ? reason.message : '批量移动失败');
    } finally {
      setBusy(false);
    }
  };

  const handleTags = async () => {
    const tags = tagInput.split(/[,，]/).map((t) => t.trim()).filter(Boolean);
    if (tags.length === 0 || busy) return;
    setBusy(true); setError('');
    try {
      await onAddTags(tags);
      setTagInput('');
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '批量添加标签失败');
    } finally {
      setBusy(false);
    }
  };

  const flat = flattenCollections(collections);

  return <Modal open={open} onClose={onClose} label={mode === 'move' ? '批量移动' : '批量添加标签'}>
    <div className="modal-header"><h2>{mode === 'move' ? '批量移动' : '批量添加标签'}</h2></div>
    {mode === 'move' ? <>
      <div className="field">
        <span>目标分类</span>
        <select className="select" value={collectionId} onChange={(e) => setCollectionId(e.target.value === '' ? '' : e.target.value === 'none' ? 'none' : Number(e.target.value))}>
          <option value="">请选择…</option>
          <option value="none">未分类</option>
          {flat.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      <div className="modal-footer"><button className="button secondary" onClick={onClose} disabled={busy}>取消</button><button className="button primary" onClick={handleMove} disabled={collectionId === '' || busy}>{busy ? '移动中…' : '移动'}</button></div>
    </> : <>
      <div className="field">
        <span>标签</span>
        <input className="input" value={tagInput} onChange={(e) => setTagInput(e.target.value)} placeholder="用逗号分隔多个标签" autoFocus />
      </div>
      <div className="modal-footer"><button className="button secondary" onClick={onClose} disabled={busy}>取消</button><button className="button primary" onClick={handleTags} disabled={!tagInput.trim() || busy}>{busy ? '添加中…' : '添加'}</button></div>
    </>}
    {error && <p className="form-error">{error}</p>}
  </Modal>;
}
