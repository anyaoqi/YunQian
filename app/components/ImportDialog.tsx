'use client';

import { useState, type ChangeEvent } from 'react';
import { api } from '@/lib/api';
import type { ImportResult } from '@/lib/types';

type Props = { open: boolean; onClose: () => void; onImported: () => void };

export function ImportDialog({ open, onClose, onImported }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [format, setFormat] = useState<'netscape' | 'raindrop' | 'toby' | 'pocket'>('netscape');
  const [mode, setMode] = useState<'skip' | 'overwrite'>('skip');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState('');
  if (!open) return null;
  const accept = format === 'raindrop' ? '.csv,text/csv' : format === 'toby' ? '.json,application/json' : '.html,.htm,text/html';
  const chooseFile = (event: ChangeEvent<HTMLInputElement>) => {
    setFile(event.target.files?.[0] ?? null); setResult(null); setError('');
  };
  const upload = async () => {
    if (!file) return;
    setBusy(true); setError('');
    try { const response = await api.importHtml(file, mode, format); setResult(response); onImported(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '导入失败'); }
    finally { setBusy(false); }
  };
  const close = () => { if (!busy) { setFile(null); setResult(null); setError(''); onClose(); } };
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
    <div className="modal import-dialog">
      <div className="modal-header"><div><span className="eyebrow">迁移你的收藏</span><h2>导入书签</h2></div><button className="icon-close" onClick={close}>×</button></div>
      <p className="modal-description">支持浏览器书签 HTML、Raindrop CSV、Toby JSON、Pocket HTML。文件夹会保留为分类，标签会自动导入。</p>
      <label className="field"><span>导入来源格式</span><select value={format} onChange={(event) => setFormat(event.target.value as 'netscape' | 'raindrop' | 'toby' | 'pocket')}><option value="netscape">浏览器书签 HTML（Chrome/Edge/Firefox/Safari）</option><option value="raindrop">Raindrop.io CSV</option><option value="toby">Toby JSON</option><option value="pocket">Pocket HTML</option></select></label>
      <label className="drop-zone"><input type="file" accept={accept} onChange={chooseFile} /><span className="upload-icon">⇧</span><strong>{file ? file.name : '选择文件'}</strong><small>{file ? `${Math.ceil(file.size / 1024)} KB` : '或拖入文件到此处'}</small></label>
      <label className="field"><span>重复网址的处理方式</span><select value={mode} onChange={(event) => setMode(event.target.value as 'skip' | 'overwrite')}><option value="skip">跳过已存在的网址（推荐）</option><option value="overwrite">以导入内容覆盖已有书签</option></select></label>
      {error && <p className="form-error">{error}</p>}
      {result && <div className="import-result"><strong>导入完成</strong><div><span><b>{result.imported}</b> 条已导入</span><span><b>{result.skipped}</b> 条已跳过</span><span><b>{result.collectionsCreated}</b> 个新分类</span><span><b>{result.tagsCreated}</b> 个新标签</span></div><small>耗时 {result.durationMs} ms</small><small className="muted">封面与描述将在后台自动补抓</small></div>}
      <div className="modal-footer"><button className="button secondary" onClick={close}>{result ? '完成' : '取消'}</button>{!result && <button className="button primary" disabled={!file || busy} onClick={upload}>{busy ? '正在导入…' : '开始导入'}</button>}</div>
    </div>
  </div>;
}
