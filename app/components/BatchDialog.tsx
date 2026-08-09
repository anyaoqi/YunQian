'use client';

import { useState } from 'react';
import type { Collection } from '@/lib/types';

type Mode = 'move' | 'tags' | null;

type Props = {
  open: boolean;
  mode: Mode;
  collections: Collection[];
  onClose: () => void;
  onMove: (collectionId: number | null) => void;
  onAddTags: (tags: string[]) => void;
};

function flattenCollections(collections: Collection[]): Collection[] {
  return collections.flatMap((c) => [c, ...flattenCollections(c.children)]);
}

export function BatchDialog({ open, mode, collections, onClose, onMove, onAddTags }: Props) {
  const [collectionId, setCollectionId] = useState<number | 'none' | ''>('');
  const [tagInput, setTagInput] = useState('');

  if (!open || !mode) return null;

  const handleMove = () => {
    if (collectionId === '') return;
    onMove(collectionId === 'none' ? null : collectionId);
    setCollectionId('');
    onClose();
  };

  const handleTags = () => {
    const tags = tagInput.split(/[,，]/).map((t) => t.trim()).filter(Boolean);
    if (tags.length === 0) return;
    onAddTags(tags);
    setTagInput('');
    onClose();
  };

  const flat = flattenCollections(collections);

  return <div className="modal-backdrop" onClick={onClose}>
    <div className="modal" onClick={(e) => e.stopPropagation()}>
      <div className="modal-header"><h2>{mode === 'move' ? '批量移动' : '批量添加标签'}</h2><button className="icon-close" onClick={onClose}>×</button></div>
      {mode === 'move' ? <>
        <div className="field">
          <span>目标分类</span>
          <select value={collectionId} onChange={(e) => setCollectionId(e.target.value === '' ? '' : e.target.value === 'none' ? 'none' : Number(e.target.value))}>
            <option value="">请选择…</option>
            <option value="none">未分类</option>
            {flat.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="modal-footer"><button className="button secondary" onClick={onClose}>取消</button><button className="button primary" onClick={handleMove} disabled={collectionId === ''}>移动</button></div>
      </> : <>
        <div className="field">
          <span>标签</span>
          <input value={tagInput} onChange={(e) => setTagInput(e.target.value)} placeholder="用逗号分隔多个标签" autoFocus />
        </div>
        <div className="modal-footer"><button className="button secondary" onClick={onClose}>取消</button><button className="button primary" onClick={handleTags} disabled={!tagInput.trim()}>添加</button></div>
      </>}
    </div>
  </div>;
}
