import { lookup } from 'node:dns/promises';
import { AppError } from './errors';

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
  return `https://a.favicon.im/${encodeURIComponent(url.hostname)}`;
}

export function titleFallback(urlValue: string): string {
  return new URL(urlValue).hostname.replace(/^www\./, '');
}

/** 判断 IPv4 点分地址是否落在私有/保留网段。无法解析的畸形地址一律视为不安全。 */
function isPrivateIpv4(host: string): boolean {
  const parts = host.split('.');
  if (parts.length !== 4 || parts.some((part) => part === '' || Number.isNaN(Number(part)))) return true;
  const octets = parts.map(Number);
  if (octets.some((value) => value < 0 || value > 255)) return true;
  const [a, b] = octets;
  return (
    a === 0 || a === 10 || a === 127 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254) ||
    (a === 100 && b >= 64 && b <= 127) || // CGNAT 100.64.0.0/10
    a >= 224 // 组播(224/4)与保留段(240/4、255.255.255.255)
  );
}

/**
 * 判断 IPv6 地址(不含方括号)是否为环回/私有/保留地址。
 * 注意 WHATWG URL 对 `http://[::1]/` 的 hostname 返回带方括号的 `[::1]`,
 * 因此比较前必须先去方括号,否则环回地址永远匹配不上。
 */
function isPrivateIpv6(host: string): boolean {
  const value = host.toLowerCase();
  if (value === '::' || value === '::1') return true;
  // IPv4-mapped IPv6(::ffff:0:0/96):十六进制与点分两种写法都要还原成 IPv4 判断
  const mapped = /^::ffff:(.+)$/.exec(value);
  if (mapped) {
    const rest = mapped[1];
    if (rest.includes('.')) return isPrivateIpv4(rest);
    const hex = /^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(rest);
    if (hex) {
      const hi = parseInt(hex[1], 16);
      const lo = parseInt(hex[2], 16);
      return isPrivateIpv4(`${hi >> 8}.${hi & 0xff}.${lo >> 8}.${lo & 0xff}`);
    }
    return true;
  }
  const firstHextet = value.split(':')[0] ?? '';
  if (/^f[cd]/.test(firstHextet)) return true; // ULA fc00::/7
  if (/^fe[89ab]/.test(firstHextet)) return true; // 链路本地 fe80::/10
  if (/^ff/.test(firstHextet)) return true; // 组播 ff00::/8
  return false;
}

function isPrivateIpAddress(host: string): boolean {
  return host.includes(':') ? isPrivateIpv6(host) : isPrivateIpv4(host);
}

function isInternalHostname(host: string): boolean {
  return (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.localdomain') ||
    host.endsWith('.internal')
  );
}

/** 主机名层级校验:去方括号 → 内网域名/IP 字面量网段判断。 */
function isSafeHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[/, '').replace(/\]$/, '');
  if (host.length === 0) return false;
  if (isInternalHostname(host)) return false;
  const isIpLiteral = host.includes(':') || /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
  return isIpLiteral ? !isPrivateIpAddress(host) : true;
}

/**
 * 同步的表层校验:协议必须是 http(s),主机不是 localhost/内网域名/IP 私网段。
 * 仅做字符串判断,不解析 DNS——解析到内网 IP 的公网域名由 assertSafePublicHttpUrl 复核。
 */
export function isSafePublicHttpUrl(input: string): boolean {
  try {
    const url = new URL(input);
    if (!['http:', 'https:'].includes(url.protocol)) return false;
    return isSafeHost(url.hostname);
  } catch {
    return false;
  }
}

/**
 * 抓取前的完整校验:表层校验 + DNS 解析复核。
 * 防御「公网域名解析到内网 IP」(内网 DNS 投毒/DNS rebinding)场景,
 * 对域名解析出的所有 A/AAAA 记录逐个做私网段判断。
 */
export async function assertSafePublicHttpUrl(input: string): Promise<void> {
  const unsafe = new AppError(400, 'UNSAFE_URL', '该网址指向内网或保留地址，不允许抓取');
  if (!isSafePublicHttpUrl(input)) throw unsafe;
  const host = new URL(input).hostname.toLowerCase().replace(/^\[/, '').replace(/\]$/, '');
  if (host.includes(':') || /^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return; // IP 字面量已在表层校验覆盖
  let addresses: { address: string }[];
  try {
    addresses = await lookup(host, { all: true, verbatim: true });
  } catch {
    throw new AppError(400, 'UNSAFE_URL', '该网址无法解析');
  }
  if (addresses.length === 0) throw unsafe;
  for (const { address } of addresses) {
    if (isPrivateIpAddress(address.toLowerCase())) throw unsafe;
  }
}
