import { describe, expect, it } from 'vitest';
import { parseNetscapeBookmarks, decodeHtml } from '../src/lib/html.js';

describe('decodeHtml', () => {
  it('解码常见实体', () => {
    expect(decodeHtml('&amp;&lt;&gt;&quot;&#39;')).toBe('&<>"\'');
  });
  it('解码数字实体（十进制与十六进制）', () => {
    expect(decodeHtml('&#65;&#x42;')).toBe('AB');
  });
  it('解码 &nbsp; 为空格', () => {
    expect(decodeHtml('a&nbsp;b')).toBe('a b');
  });
});

describe('parseNetscapeBookmarks', () => {
  it('解析带文件夹层级的书签', () => {
    const html = `
      <DL><p>
        <DT><H3>开发</H3>
        <DL><p>
          <DT><A HREF="https://github.com" TAGS="git,dev">GitHub</A>
          <DD>代码托管平台
        </DL><p>
        <DT><A HREF="https://example.com">Example</A>
      </DL><p>
    `;
    const items = parseNetscapeBookmarks(html);
    expect(items).toHaveLength(2);
    expect(items[0].url).toBe('https://github.com');
    expect(items[0].title).toBe('GitHub');
    expect(items[0].description).toBe('代码托管平台');
    expect(items[0].tags).toEqual(['git', 'dev']);
    expect(items[0].collectionPath).toEqual(['开发']);
    expect(items[1].url).toBe('https://example.com');
    expect(items[1].collectionPath).toEqual([]);
  });
  it('解析 add_date 时间戳', () => {
    const html = `<DL><p><DT><A HREF="https://example.com" ADD_DATE="1700000000">Example</A></DL><p>`;
    const items = parseNetscapeBookmarks(html);
    expect(items[0].createdAt).toBe(new Date(1700000000 * 1000).toISOString());
  });
  it('忽略缺少 href 的 A 标签', () => {
    const html = `<DL><p><DT><A>无链接</A></DL><p>`;
    expect(parseNetscapeBookmarks(html)).toHaveLength(0);
  });
  it('支持单引号属性', () => {
    const html = `<DL><p><DT><A HREF='https://example.com'>Example</A></DL><p>`;
    expect(parseNetscapeBookmarks(html)).toHaveLength(1);
    expect(parseNetscapeBookmarks(html)[0].url).toBe('https://example.com');
  });
  it('解码标题中的 HTML 实体', () => {
    const html = `<DL><p><DT><A HREF="https://example.com">Tom &amp; Jerry</A></DL><p>`;
    expect(parseNetscapeBookmarks(html)[0].title).toBe('Tom & Jerry');
  });
  it('处理多级嵌套文件夹', () => {
    const html = `
      <DL><p>
        <DT><H3>一级</H3>
        <DL><p>
          <DT><H3>二级</H3>
          <DL><p>
            <DT><A HREF="https://deep.com">Deep</A>
          </DL><p>
        </DL><p>
      </DL><p>
    `;
    const items = parseNetscapeBookmarks(html);
    expect(items[0].collectionPath).toEqual(['一级', '二级']);
  });
});
