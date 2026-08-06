export type ImportedBookmark = {
  url: string;
  title: string;
  description: string | null;
  tags: string[];
  collectionPath: string[];
  createdAt: string | null;
};

export function decodeHtml(value: string): string {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code: string) => String.fromCodePoint(parseInt(code, 16)));
}

function text(value: string): string {
  return decodeHtml(value.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim());
}

function attribute(source: string, name: string): string | null {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`\\b${escaped}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(source);
  return match ? decodeHtml(match[1] ?? match[2] ?? match[3] ?? '') : null;
}

function dateFromUnix(value: string | null): string | null {
  if (!value || !/^\d+$/.test(value)) return null;
  const time = Number(value) * 1000;
  return Number.isFinite(time) && time > 0 ? new Date(time).toISOString() : null;
}

/**
 * 解析浏览器导出的 Netscape bookmarks.html。
 * 纯函数，不碰数据库，可独立单测。
 */
export function parseNetscapeBookmarks(html: string): ImportedBookmark[] {
  const items: ImportedBookmark[] = [];
  const folders: string[] = [];
  const dlStack: boolean[] = [];
  let pendingFolder: string | null = null;
  let lastBookmark: ImportedBookmark | null = null;
  const token = /<H3\b([^>]*)>([\s\S]*?)<\/H3\s*>|<A\b([^>]*)>([\s\S]*?)<\/A\s*>|<DD\b[^>]*>([^<]*)|<DL\b[^>]*>|<\/DL\s*>/gi;

  for (const match of html.matchAll(token)) {
    const raw = match[0];
    if (/^<H3\b/i.test(raw)) {
      pendingFolder = text(match[2] ?? '');
      lastBookmark = null;
    } else if (/^<DL\b/i.test(raw)) {
      const isFolder = Boolean(pendingFolder);
      if (pendingFolder) folders.push(pendingFolder);
      pendingFolder = null;
      dlStack.push(isFolder);
      lastBookmark = null;
    } else if (/^<\/DL/i.test(raw)) {
      if (dlStack.pop()) folders.pop();
      lastBookmark = null;
    } else if (/^<A\b/i.test(raw)) {
      const url = attribute(match[3] ?? '', 'href');
      if (!url) continue;
      const tags = (attribute(match[3] ?? '', 'tags') ?? '').split(',').map((tag) => text(tag)).filter(Boolean);
      lastBookmark = {
        url: decodeHtml(url),
        title: text(match[4] ?? ''),
        description: null,
        tags,
        collectionPath: [...folders],
        createdAt: dateFromUnix(attribute(match[3] ?? '', 'add_date')),
      };
      items.push(lastBookmark);
    } else if (/^<DD\b/i.test(raw) && lastBookmark) {
      const description = text(match[5] ?? '');
      if (description) lastBookmark.description = description;
    }
  }
  return items;
}
