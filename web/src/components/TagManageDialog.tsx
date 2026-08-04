import { useEffect, useState } from 'react';
import { api } from '../api';
import type { Tag } from '../types';

type Props = { open: boolean; tags: Tag[]; onClose: () => void; onChanged: () => void; };

const PRESET_COLORS = ['#ef4444', '#f97316', '#f59e0b', '#84cc16', '#10b981', '#06b6d4', '#3b82f6', '#8b5cf6', '#d946ef', '#f43f5e', '#6b7280', '#000000'];

export function TagManageDialog({ open, tags, onClose, onChanged }: Props) {
  const [editing, setEditing] = useState<Tag | null>(null);
  const [name, setName] = useState('');
  const [color, setColor] = useState<string | null>(null);
  const [mergeTarget, setMergeTarget] = useState<number | ''>('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (editing) { setName(editing.name); setColor(editing.color); setMergeTarget(''); }
  }, [editing]);

  if (!open) return null;

  const save = async () => {
    if (!editing) return;
    try { await api.updateTag(editing.id, { name, color }); onChanged(); setEditing(null); setError(''); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '保存失败'); }
  };

  const merge = async () => {
    if (!editing || mergeTarget === '') return;
    try { await api.mergeTags(editing.id, Number(mergeTarget)); onChanged(); setEditing(null); setMergeTarget(''); setError(''); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '合并失败'); }
  };

  const clean = async () => {
    try { const result = await api.cleanOrphanTags(); onChanged(); setError(''); setNotice(`已清理 ${result.deleted} 个空标签`); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '清理失败'); }
  };

  return <div className="modal-backdrop" onClick={onClose}>
    <div className="modal" onClick={(e) => e.stopPropagation()}>
      <div className="modal-header"><h2>标签管理</h2><button className="icon-close" onClick={onClose}>×</button></div>
      <div className="modal-description">点击标签进行编辑、重命名、合并或着色。</div>
      <div className="tag-manage-list">
        {tags.map((tag) => <button key={tag.id} className={`tag-row ${editing?.id === tag.id ? 'active' : ''}`} onClick={() => setEditing(tag)}>
          <span className="tag-dot" style={{ background: tag.color ?? '#8b8fc7' }} />
          <span>{tag.name}</span>
          <small>{tag.count} 条</small>
        </button>)}
      </div>
      {editing && <div className="tag-edit-panel">
        <div className="field"><span>名称</span><input value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div className="field"><span>颜色</span>
          <div className="color-palette">
            {PRESET_COLORS.map((c) => <button key={c} className={`color-swatch ${color === c ? 'active' : ''}`} style={{ background: c }} onClick={() => setColor(c)} />)}
            <button className={`color-swatch reset ${color === null ? 'active' : ''}`} onClick={() => setColor(null)}>无</button>
          </div>
        </div>
        <div className="field"><span>合并到</span>
          <select value={mergeTarget} onChange={(e) => setMergeTarget(e.target.value === '' ? '' : Number(e.target.value))}>
            <option value="">选择目标标签…</option>
            {tags.filter((t) => t.id !== editing.id).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <div className="modal-footer">
          <button className="button secondary" onClick={() => setEditing(null)}>取消</button>
          {mergeTarget !== '' && <button className="button primary" onClick={merge}>合并</button>}
          <button className="button primary" onClick={save}>保存</button>
        </div>
      </div>}
      {error && <p className="form-error">{error}</p>}
      {notice && <p className="form-notice">{notice}</p>}
      <div className="modal-footer">
        <button className="button secondary" onClick={clean}>清理空标签</button>
        <button className="button secondary" onClick={onClose}>关闭</button>
      </div>
    </div>
  </div>;
}
