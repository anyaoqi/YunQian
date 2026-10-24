'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Modal } from './ui/Modal';
import type { Tag } from '@/lib/types';

type Props = { open: boolean; tags: Tag[]; onClose: () => void; onChanged: () => void; };

const PRESET_COLORS = ['#c0392b', '#e8590c', '#b9821f', '#5d8a3c', '#1f7a5c', '#2f6f8f', '#3b5b8f', '#6b4f9e', '#8f3b6b', '#7d8fa0', '#3d4551', '#111318'];

export function TagManageDialog({ open, tags, onClose, onChanged }: Props) {
  const [editing, setEditing] = useState<Tag | null>(null);
  const [name, setName] = useState('');
  const [color, setColor] = useState<string | null>(null);
  const [mergeTarget, setMergeTarget] = useState<number | ''>('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (editing) { setName(editing.name); setColor(editing.color); setMergeTarget(''); }
  }, [editing]);

  if (!open) return null;

  const save = async () => {
    if (!editing || busy) return;
    const trimmed = name.trim();
    if (!trimmed) { setError('标签名称不能为空'); return; }
    setBusy(true);
    try { await api.updateTag(editing.id, { name: trimmed, color }); onChanged(); setEditing(null); setError(''); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '保存失败'); }
    finally { setBusy(false); }
  };

  const merge = async () => {
    if (!editing || mergeTarget === '' || busy) return;
    setBusy(true);
    try { await api.mergeTags(editing.id, Number(mergeTarget)); onChanged(); setEditing(null); setMergeTarget(''); setError(''); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '合并失败'); }
    finally { setBusy(false); }
  };

  const clean = async () => {
    if (busy) return;
    setBusy(true);
    try { const result = await api.cleanOrphanTags(); onChanged(); setError(''); setNotice(`已清理 ${result.deleted} 个空标签`); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '清理失败'); }
    finally { setBusy(false); }
  };

  return <Modal open={open} onClose={onClose} label="标签管理">
    <div className="modal-header"><h2>标签管理</h2></div>
    <p className="modal-description">点击标签进行编辑、重命名、合并或着色。</p>
    <div className="tag-manage-list">
      {tags.map((tag) => <button key={tag.id} className={`tag-row ${editing?.id === tag.id ? 'active' : ''}`} onClick={() => setEditing(tag)}>
        <span className="tag-dot" style={{ background: tag.color ?? 'var(--line)' }} />
        <span>{tag.name}</span>
        <small>{tag.count}</small>
      </button>)}
    </div>
    {editing && <div className="tag-edit-panel">
      <div className="field"><span>名称</span><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></div>
      <div className="field"><span>颜色</span>
        <div className="color-palette">
          {PRESET_COLORS.map((c) => <button key={c} type="button" className={`color-swatch ${color === c ? 'active' : ''}`} style={{ background: c }} onClick={() => setColor(c)} aria-label={`颜色 ${c}`} />)}
          <button type="button" className={`color-swatch reset ${color === null ? 'active' : ''}`} onClick={() => setColor(null)}>无</button>
        </div>
      </div>
      <div className="field"><span>合并到</span>
        <select className="select" value={mergeTarget} onChange={(e) => setMergeTarget(e.target.value === '' ? '' : Number(e.target.value))}>
          <option value="">选择目标标签…</option>
          {tags.filter((t) => t.id !== editing.id).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </div>
      <div className="modal-footer">
        <button className="button secondary" onClick={() => setEditing(null)} disabled={busy}>取消</button>
        {mergeTarget !== '' && <button className="button primary" onClick={merge} disabled={busy}>合并</button>}
        <button className="button primary" onClick={save} disabled={busy || !name.trim()}>{busy ? '保存中…' : '保存'}</button>
      </div>
    </div>}
    {error && <p className="form-error">{error}</p>}
    {notice && <p className="form-notice">{notice}</p>}
    <div className="modal-footer">
      <button className="button secondary" onClick={clean} disabled={busy}>清理空标签</button>
      <button className="button secondary" onClick={onClose} disabled={busy}>关闭</button>
    </div>
  </Modal>;
}
