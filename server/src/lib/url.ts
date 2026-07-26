import { AppError } from './errors.js';

const trackingParameter = /^(utm_.+|fbclid|gclid|dclid|msclkid|spm)$/i;

export function normalizeUrl(input: string): string {
  let value = input.trim();
  if (!/^[a-zA-Z][a-zA-Z\d+.-]*:\/\//.test(value)) value = `https://${value}`;

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new AppError(400, 'INVALID_URL', '请输入有效的网址');
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new AppError(400, 'INVALID_URL', '仅支持 http 或 https 网址');
  }

  for (const key of [...url.searchParams.keys()]) {
    if (trackingParameter.test(key)) url.searchParams.delete(key);
  }
  return url.toString();
}

export function faviconFor(urlValue: string): string {
  const url = new URL(urlValue);
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(url.hostname)}&sz=64`;
}

export function titleFallback(urlValue: string): string {
  return new URL(urlValue).hostname.replace(/^www\./, '');
}

export function isSafePublicHttpUrl(input: string): boolean {
  try {
    const url = new URL(input);
    if (!['http:', 'https:'].includes(url.protocol)) return false;
    const host = url.hostname.toLowerCase();
    if (host === 'localhost' || host.endsWith('.local') || host === '::1') return false;
    if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) || /^169\.254\./.test(host)) return false;
    const match = /^172\.(\d+)\./.exec(host);
    if (match && Number(match[1]) >= 16 && Number(match[1]) <= 31) return false;
    return true;
  } catch {
    return false;
  }
}
