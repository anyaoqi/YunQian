'use client';

import { useState, type ChangeEvent, type DragEvent } from 'react';
import { FileUp } from 'lucide-react';
import { api } from '@/lib/api';
import { Modal } from './ui/Modal';
import type { ImportResult } from '@/lib/types';

type Props = { open: boolean; onClose: () => void; onImported: () => void };

/**
 * 按内容探测解码:先按 UTF-8 读,若出现 U+FFFD(解码失败标记)则尝试 GBK,
 * 取替换符更少的那份。浏览器书签导出 HTML 常有 GBK/GB2312 编码(尤其老版中文浏览器),
 * 一律按 UTF-8 硬解会把中文标题/文件夹名永久写成乱码。
 */
async function readFileText(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const utf8 = new TextDecoder('utf-8').decode(buffer);
  const utf8Loss = (utf8.match(/\uFFFD/g) ?? []).length;
  if (utf8Loss === 0) return utf8;
  let gbk = '';
  try { gbk = new TextDecoder('gbk').decode(buffer); } catch { return utf8; }
  const gbkLoss = (gbk.match(/\uFFFD/g) ?? []).length;
  return gbkLoss < utf8Loss ? gbk : utf8;
}

export function ImportDialog({ open, onClose, onImported }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [format, setFormat] = useState<'netscape' | 'raindrop' | 'toby' | 'pocket'>('netscape');
  const [mode, setMode] = useState<'skip' | 'overwrite'>('skip');
  const [busy, setBusy] = useState(false);
  const [dragover, setDragover] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState('');
  if (!open) return null;
  const accept = format === 'raindrop' ? '.csv,text/csv' : format === 'toby' ? '.json,application/json' : '.html,.htm,text/html';
  const chooseFile = (event: ChangeEvent<HTMLInputElement>) => {
    setFile(event.target.files?.[0] ?? null); setResult(null); setError('');
  };
  const onDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setDragover(false);
    const dropped = event.dataTransfer.files?.[0];
    if (dropped) { setFile(dropped); setResult(null); setError(''); }
  };
  const upload = async () => {
    if (!file) return;
    setBusy(true); setError('');
    try { const response = await api.importHtml(await readFileText(file), mode, format); setResult(response); onImported(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '导入失败'); }
    finally { setBusy(false); }
  };
  const close = () => { if (!busy) { setFile(null); setResult(null); setError(''); onClose(); } };
  return <Modal open={open} onClose={close} label="导入书签">
    <div className="modal-header"><h2>导入书签</h2></div>
    <p className="modal-description">支持浏览器书签 HTML、Raindrop CSV、Toby JSON、Pocket HTML。文件夹会保留为分类,标签会自动导入。</p>
    <label
      className={`drop-zone ${dragover ? 'dragover' : ''}`}
      onDragOver={(event) => { event.preventDefault(); setDragover(true); }}
      onDragLeave={() => setDragover(false)}
      onDrop={onDrop}
    >
      <input type="file" accept={accept} onChange={chooseFile} />
      <FileUp aria-hidden />
      <strong>{file ? file.name : '选择文件'}</strong>
      <small>{file ? `${Math.ceil(file.size / 1024)} KB` : '或拖入文件到此处'}</small>
    </label>
    <label className="field"><span>导入来源格式</span><select className="select" value={format} onChange={(event) => setFormat(event.target.value as 'netscape' | 'raindrop' | 'toby' | 'pocket')}><option value="netscape">浏览器书签 HTML(Chrome/Edge/Firefox/Safari)</option><option value="raindrop">Raindrop.io CSV</option><option value="toby">Toby JSON</option><option value="pocket">Pocket HTML</option></select></label>
    <label className="field"><span>重复网址的处理方式</span><select className="select" value={mode} onChange={(event) => setMode(event.target.value as 'skip' | 'overwrite')}><option value="skip">跳过已存在的网址(推荐)</option><option value="overwrite">以导入内容覆盖已有书签</option></select></label>
    {error && <p className="form-error">{error}</p>}
    {result && <div className="import-result"><strong>导入完成</strong><div><span><b>{result.imported}</b> 条已导入</span><span><b>{result.skipped}</b> 条已跳过</span><span><b>{result.collectionsCreated}</b> 个新分类</span><span><b>{result.tagsCreated}</b> 个新标签</span></div><small className="mono">耗时 {result.durationMs} ms · 封面与描述将在后台自动补抓</small></div>}
    <div className="modal-footer"><button className="button secondary" onClick={close}>{result ? '完成' : '取消'}</button>{!result && <button className="button primary" disabled={!file || busy} onClick={upload}>{busy ? '正在导入…' : '开始导入'}</button>}</div>
  </Modal>;
}
