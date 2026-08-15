'use client';

import { FolderInput, Tags, Trash2, X } from 'lucide-react';

type Props = {
  count: number;
  total: number;
  onMove: () => void;
  onTags: () => void;
  onDelete: () => void;
  onClear: () => void;
  onSelectAll: () => void;
};

export function BatchActionBar({ count, total, onMove, onTags, onDelete, onClear, onSelectAll }: Props) {
  if (count === 0) return null;
  return <div className="batch-action-bar">
    <span>已选 <b>{count}</b> / {total} 项</span>
    <div className="batch-actions">
      <button className="button secondary" onClick={onSelectAll}>全选</button>
      <button className="button secondary" onClick={onMove}><FolderInput aria-hidden />移动到</button>
      <button className="button secondary" onClick={onTags}><Tags aria-hidden />加标签</button>
      <button className="button danger" onClick={onDelete}><Trash2 aria-hidden />删除</button>
      <button className="button ghost" onClick={onClear}><X aria-hidden />取消</button>
    </div>
  </div>;
}
