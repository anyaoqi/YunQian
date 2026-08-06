import { describe, expect, it } from 'vitest';
import { normalizeUrl, isSafePublicHttpUrl, faviconFor, titleFallback } from '../src/lib/url.js';

describe('normalizeUrl', () => {
  it('补全缺失的协议为 https', () => {
    expect(normalizeUrl('example.com')).toBe('https://example.com/');
  });
  it('保留显式 http 协议', () => {
    expect(normalizeUrl('http://example.com')).toBe('http://example.com/');
  });
  it('去除跟踪参数 utm_* / fbclid / gclid', () => {
    const result = normalizeUrl('https://example.com/p?utm_source=x&fbclid=abc&keep=1');
    expect(result).toBe('https://example.com/p?keep=1');
  });
  it('拒绝非 http(s) 协议', () => {
    expect(() => normalizeUrl('javascript:alert(1)')).toThrow();
    expect(() => normalizeUrl('file:///etc/passwd')).toThrow();
  });
  it('拒绝无效 URL', () => {
    expect(() => normalizeUrl('  ')).toThrow();
  });
});

describe('isSafePublicHttpUrl', () => {
  it('放行公网域名', () => {
    expect(isSafePublicHttpUrl('https://example.com')).toBe(true);
  });
  it('拒绝 localhost', () => {
    expect(isSafePublicHttpUrl('http://localhost:3000')).toBe(false);
  });
  it('拒绝 127.0.0.1 回环', () => {
    expect(isSafePublicHttpUrl('http://127.0.0.1')).toBe(false);
  });
  it('拒绝 10.x 内网', () => {
    expect(isSafePublicHttpUrl('http://10.0.0.1')).toBe(false);
  });
  it('拒绝 192.168.x 内网', () => {
    expect(isSafePublicHttpUrl('http://192.168.1.1')).toBe(false);
  });
  it('拒绝 172.16-31.x 内网', () => {
    expect(isSafePublicHttpUrl('http://172.16.0.1')).toBe(false);
    expect(isSafePublicHttpUrl('http://172.31.255.1')).toBe(false);
    expect(isSafePublicHttpUrl('http://172.32.0.1')).toBe(true);
  });
  it('拒绝非 http 协议', () => {
    expect(isSafePublicHttpUrl('ftp://example.com')).toBe(false);
  });
});

describe('faviconFor / titleFallback', () => {
  it('faviconFor 返回基于域名的服务链接', () => {
    expect(faviconFor('https://www.example.com/path')).toBe('https://a.favicon.im/www.example.com');
  });
  it('titleFallback 去除 www. 前缀', () => {
    expect(titleFallback('https://www.example.com')).toBe('example.com');
  });
});
