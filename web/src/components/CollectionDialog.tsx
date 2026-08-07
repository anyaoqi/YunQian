import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { api } from '../api';
import type { Collection } from '../types';

type Props = { open: boolean; collection: Collection | null; collections: Collection[]; onClose: () => void; onSaved: () => void };

// 收集自身及所有后代的 id，用于在父级下拉中排除，避免循环引用
function collectDescendantIds(collection: Collection): Set<number> {
  const ids = new Set<number>();
  const walk = (node: Collection) => { ids.add(node.id); node.children.forEach(walk); };
  walk(collection);
  return ids;
}

// 把树拍平成下拉选项，根级用 prefix 体现层级
function flattenForParent(collections: Collection[], excluded: Set<number>, prefix = ''): Array<{ id: number; label: string }> {
  const result: Array<{ id: number; label: string }> = [];
  for (const collection of collections) {
    if (excluded.has(collection.id)) continue;
    result.push({ id: collection.id, label: `${prefix}${collection.icon ?? '📁'} ${collection.name}` });
    const children = flattenForParent(collection.children, excluded, `${prefix}　`);
    for (const child of children) result.push(child);
  }
  return result;
}

export function CollectionDialog({ open, collection, collections, onClose, onSaved }: Props) {
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
      setParentId('');
    }
  }, [open, collection]);

  const parentOptions = useMemo(() => {
    if (!collection) return flattenForParent(collections, new Set());
    return flattenForParent(collections, collectDescendantIds(collection));
  }, [collections, collection]);

  if (!open) return null;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) { setError('分类名称不能为空'); return; }
    if (!collection) return;
    const nextParentId = parentId ? Number(parentId) : null;
    // 没有任何变化时直接关闭
    if (trimmed === collection.name && nextParentId === collection.parentId) { onSaved(); return; }
    setSaving(true); setError('');
    try {
      await api.updateCollection(collection.id, { name: trimmed, parentId: nextParentId });
      onSaved();
    } catch (reason) { setError(reason instanceof Error ? reason.message : '保存失败'); }
    finally { setSaving(false); }
  };

  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <form className="modal collection-dialog" onSubmit={submit}>
      <div className="modal-header">
        <div><span className="eyebrow">编辑分类</span><h2>修改名称与父级</h2></div>
        <button type="button" className="icon-close" onClick={onClose}>×</button>
      </div>
      <label className="field"><span>名称 <b>*</b></span><input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="输入分类名称" /></label>
      <label className="field"><span>父级分类</span>
        <select value={parentId} onChange={(event) => setParentId(event.target.value)}>
          <option value="">— 根级（无父级）—</option>
          {parentOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
        </select>
      </label>
      <p className="modal-description">修改父级后，该分类会移动到所选分类下；其内部的书签和子分类保持不变。</p>
      {error && <p className="form-error">{error}</p>}
      <div className="modal-footer">
        <button type="button" className="button secondary" onClick={onClose}>取消</button>
        <button className="button primary" disabled={saving}>{saving ? '保存中…' : '保存修改'}</button>
      </div>
    </form>
  </div>;
}
