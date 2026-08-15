'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { api } from '@/lib/api';
import { Modal } from './ui/Modal';
import type { Collection } from '@/lib/types';

type Props = {
  open: boolean;
  /** null 且 open 时为「新建分类」模式;非 null 为「编辑」模式 */
  collection: Collection | null;
  collections: Collection[];
  /** 新建模式的默认父级 */
  defaultParentId?: number | null;
  onClose: () => void;
  onSaved: () => void;
};

// 收集自身及所有后代的 id,用于在父级下拉中排除,避免循环引用
function collectDescendantIds(collection: Collection): Set<number> {
  const ids = new Set<number>();
  const walk = (node: Collection) => { ids.add(node.id); node.children.forEach(walk); };
  walk(collection);
  return ids;
}

// 把树拍平成下拉选项,根级用 prefix 体现层级
function flattenForParent(collections: Collection[], excluded: Set<number>, prefix = ''): Array<{ id: number; label: string }> {
  const result: Array<{ id: number; label: string }> = [];
  for (const collection of collections) {
    if (excluded.has(collection.id)) continue;
    result.push({ id: collection.id, label: `${prefix}${collection.name}` });
    const children = flattenForParent(collection.children, excluded, `${prefix}　`);
    for (const child of children) result.push(child);
  }
  return result;
}

export function CollectionDialog({ open, collection, collections, defaultParentId, onClose, onSaved }: Props) {
  const creating = collection == null;
  const [name, setName] = useState('');
  const [parentId, setParentId] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setError('');
    if (collection) {
      setName(collection.name);
      setParentId(collection.parentId?.toString() ?? '');
    } else {
      setName('');
      setParentId(defaultParentId != null ? defaultParentId.toString() : '');
    }
  }, [open, collection, defaultParentId]);

  const parentOptions = useMemo(() => {
    if (creating) return flattenForParent(collections, new Set());
    return flattenForParent(collections, collectDescendantIds(collection));
  }, [collections, collection, creating]);

  if (!open) return null;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) { setError('分类名称不能为空'); return; }
    const nextParentId = parentId ? Number(parentId) : null;
    if (!creating) {
      // 没有任何变化时直接关闭
      if (trimmed === collection.name && nextParentId === collection.parentId) { onSaved(); return; }
    }
    setSaving(true); setError('');
    try {
      if (creating) await api.createCollection({ name: trimmed, parentId: nextParentId });
      else await api.updateCollection(collection.id, { name: trimmed, parentId: nextParentId });
      onSaved();
    } catch (reason) { setError(reason instanceof Error ? reason.message : '保存失败'); }
    finally { setSaving(false); }
  };

  return <Modal open={open} onClose={onClose} label={creating ? '新建分类' : '编辑分类'}>
    <form onSubmit={submit}>
      <div className="modal-header"><h2>{creating ? '新建分类' : '编辑分类'}</h2></div>
      <label className="field"><span>名称 <b>*</b></span><input className="input" autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="输入分类名称" /></label>
      <label className="field"><span>父级分类</span>
        <select className="select" value={parentId} onChange={(event) => setParentId(event.target.value)}>
          <option value="">— 根级(无父级)—</option>
          {parentOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
        </select>
      </label>
      {!creating && <p className="modal-description">修改父级后,该分类会移动到所选分类下;其内部的书签和子分类保持不变。</p>}
      {error && <p className="form-error">{error}</p>}
      <div className="modal-footer">
        <button type="button" className="button secondary" onClick={onClose}>取消</button>
        <button className="button primary" disabled={saving}>{saving ? '保存中…' : creating ? '创建分类' : '保存修改'}</button>
      </div>
    </form>
  </Modal>;
}
