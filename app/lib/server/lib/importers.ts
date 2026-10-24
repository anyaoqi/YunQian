import { decodeHtml, type ImportedBookmark } from './html';

/**
 * 解析 Raindrop.io 导出的 CSV。
 * 表头通常含：url, title, note, folder, tags, created, cover, favorite, type, excerpt
 * 这里只取我们关心的字段，忽略未知列。
 */
export function parseRaindropCsv(csv: string): ImportedBookmark[] {
  // Excel/编辑器导出常带 UTF-8 BOM,不去掉会导致首列名匹配失败、全部行被静默跳过
  const lines = splitCsvLines(csv.replace(/^\uFEFF/, ''));
  if (lines.length < 2) return [];
  const header = lines[0].map((cell) => cell.trim().toLowerCase());
  const col = (name: string): number => header.indexOf(name);
  const urlIdx = col('url');
  const titleIdx = col('title');
  const noteIdx = col('note');
  const folderIdx = col('folder');
  const tagsIdx = col('tags');
  const createdIdx = col('created');
  const items: ImportedBookmark[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i];
    if (urlIdx === -1 || !cells[urlIdx]) continue;
    const url = cells[urlIdx];
    const tags = tagsIdx !== -1 && cells[tagsIdx] ? cells[tagsIdx].split(',').map((t) => t.trim()).filter(Boolean) : [];
    const collectionPath = folderIdx !== -1 && cells[folderIdx] ? cells[folderIdx].split('/').map((p) => p.trim()).filter(Boolean) : [];
    items.push({
      url,
      title: titleIdx !== -1 ? cells[titleIdx] : '',
      description: noteIdx !== -1 ? cells[noteIdx] || null : null,
      tags,
      collectionPath,
      createdAt: parseIsoDate(createdIdx !== -1 ? cells[createdIdx] : null),
    });
  }
  return items;
}

type TobyItem = { title?: string; url?: string; tags?: string[] };
type TobyCollection = { title?: string; list?: TobyItem[] };

/**
 * 解析 Toby 导出的 JSON（{ collections: [{ title, list: [{ title, url, tags }] }] }）。
 */
export function parseTobyJson(json: string): ImportedBookmark[] {
  let data: unknown;
  try { data = JSON.parse(json); } catch { return []; }
  const items: ImportedBookmark[] = [];
  if (typeof data !== 'object' || data === null) return items;
  const collections = (data as { collections?: TobyCollection[] }).collections;
  if (!Array.isArray(collections)) return items;
  for (const collection of collections) {
    const folder = collection.title ? [collection.title] : [];
    const list = Array.isArray(collection.list) ? collection.list : [];
    for (const entry of list) {
      if (!entry.url) continue;
      items.push({
        url: entry.url,
        title: entry.title || '',
        description: null,
        tags: Array.isArray(entry.tags) ? entry.tags.map((t) => String(t)).filter(Boolean) : [],
        collectionPath: [...folder],
        createdAt: null,
      });
    }
  }
  return items;
}

/**
 * 解析 Pocket 导出的 HTML（每条为一个 <a href="...">title</a>，后跟 <p> excerpt）。
 * Pocket 导出格式较简单，没有文件夹概念。
 */
export function parsePocketHtml(html: string): ImportedBookmark[] {
  const items: ImportedBookmark[] = [];
  const token = /<a\s+([^>]*)>([\s\S]*?)<\/a>|<p\b[^>]*>([\s\S]*?)<\/p>/gi;
  let lastBookmark: ImportedBookmark | null = null;
  for (const match of html.matchAll(token)) {
    if (match[1] !== undefined) {
      const attrs = match[1];
      const url = attribute(attrs, 'href');
      if (!url) continue;
      lastBookmark = {
        url: decodeHtml(url),
        title: decodeHtml((match[2] ?? '').replace(/<[^>]*>/g, '').trim()),
        description: null,
        tags: [],
        collectionPath: [],
        createdAt: parseUnixAttribute(attribute(attrs, 'time_added')),
      };
      items.push(lastBookmark);
    } else if (lastBookmark && match[3] !== undefined) {
      const excerpt = decodeHtml((match[3]).replace(/<[^>]*>/g, '').trim());
      if (excerpt) lastBookmark.description = excerpt;
    }
  }
  return items;
}

function attribute(source: string, name: string): string | null {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`\\b${escaped}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(source);
  return match ? decodeHtml(match[1] ?? match[2] ?? match[3] ?? '') : null;
}

function parseIsoDate(value: string | null): string | null {
  if (!value) return null;
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : new Date(time).toISOString();
}

function parseUnixAttribute(value: string | null): string | null {
  if (!value || !/^\d+$/.test(value)) return null;
  const time = Number(value) * 1000;
  return Number.isFinite(time) && time > 0 ? new Date(time).toISOString() : null;
}

/** 简易 CSV 行切分：支持双引号包裹的字段（含换行、逗号、转义双引号）。 */
function splitCsvLines(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < csv.length; i++) {
    const char = csv[i];
    if (inQuotes) {
      if (char === '"') {
        if (csv[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += char;
    } else {
      if (char === '"') inQuotes = true;
      else if (char === ',') { row.push(field); field = ''; }
      else if (char === '\n' || char === '\r') {
        if (char === '\r' && csv[i + 1] === '\n') i++;
        row.push(field); rows.push(row); row = []; field = '';
      } else field += char;
    }
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
}
