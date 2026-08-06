import { describe, expect, it } from 'vitest';
import { parseRaindropCsv, parseTobyJson, parsePocketHtml } from '../src/lib/importers.js';

describe('parseRaindropCsv', () => {
  it('解析标准 Raindrop CSV 表头', () => {
    const csv = 'url,title,note,folder,tags,created\nhttps://github.com,GitHub,代码托管,开发/A,"git,dev",2024-01-01\nhttps://example.com,Example,,\n';
    const items = parseRaindropCsv(csv);
    expect(items).toHaveLength(2);
    expect(items[0].url).toBe('https://github.com');
    expect(items[0].title).toBe('GitHub');
    expect(items[0].description).toBe('代码托管');
    expect(items[0].tags).toEqual(['git', 'dev']);
    expect(items[0].collectionPath).toEqual(['开发', 'A']);
    expect(items[1].collectionPath).toEqual([]);
  });
  it('处理含引号与逗号的字段', () => {
    const csv = 'url,title,note\n"https://a.com","Hello, World","line1\nline2"\n';
    const items = parseRaindropCsv(csv);
    expect(items[0].title).toBe('Hello, World');
    expect(items[0].description).toBe('line1\nline2');
  });
  it('空 CSV 返回空数组', () => {
    expect(parseRaindropCsv('')).toEqual([]);
    expect(parseRaindropCsv('url,title\n')).toEqual([]);
  });
});

describe('parseTobyJson', () => {
  it('解析 Toby collections 结构', () => {
    const json = JSON.stringify({
      collections: [
        { title: '工作', list: [{ title: 'GitHub', url: 'https://github.com', tags: ['dev'] }] },
        { title: '学习', list: [{ title: 'MDN', url: 'https://mdn.io' }] },
      ],
    });
    const items = parseTobyJson(json);
    expect(items).toHaveLength(2);
    expect(items[0].collectionPath).toEqual(['工作']);
    expect(items[0].tags).toEqual(['dev']);
    expect(items[1].collectionPath).toEqual(['学习']);
  });
  it('无效 JSON 返回空数组', () => {
    expect(parseTobyJson('not json')).toEqual([]);
  });
  it('缺少 collections 字段返回空数组', () => {
    expect(parseTobyJson('{}')).toEqual([]);
  });
});

describe('parsePocketHtml', () => {
  it('解析 Pocket 导出的 a + p 结构', () => {
    const html = `
      <a href="https://example.com" time_added="1700000000">Example</a>
      <p>这是一个示例网站</p>
      <a href="https://github.com" time_added="1700000001">GitHub</a>
    `;
    const items = parsePocketHtml(html);
    expect(items).toHaveLength(2);
    expect(items[0].url).toBe('https://example.com');
    expect(items[0].description).toBe('这是一个示例网站');
    expect(items[0].createdAt).toBe(new Date(1700000000 * 1000).toISOString());
    expect(items[1].description).toBeNull();
  });
  it('忽略缺少 href 的条目', () => {
    const html = '<a>无链接</a><a href="https://x.com">X</a>';
    expect(parsePocketHtml(html)).toHaveLength(1);
  });
});
