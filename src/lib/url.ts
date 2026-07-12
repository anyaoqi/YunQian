// URL 归一化，用于去重比较。保持显示用的原始 url 不变。

const TRACKING_PARAMS = [
  /^utm_/i,
  /^fbclid$/i,
  /^gclid$/i,
  /^dclid$/i,
  /^msclkid$/i,
  /^ref$/i,
  /^ref_src$/i,
  /^spm$/i,
  /^from$/i,
  /^source$/i,
  /^_ga$/i,
  /^mc_eid$/i,
  /^igshid$/i,
]

const DEFAULT_PORTS: Record<string, string> = {
  'http:': '80',
  'https:': '443',
}

function isTracking(key: string): boolean {
  return TRACKING_PARAMS.some((re) => re.test(key))
}

/**
 * 归一化 URL：
 * - scheme/host 小写
 * - 去默认端口
 * - 剔除常见跟踪参数，并对剩余 query 参数排序
 * - 去末尾斜杠
 * - 去 fragment（#...）
 * 解析失败时回退为去空白后的原串小写。
 */
export function normalizeUrl(raw: string): string {
  const input = (raw || '').trim()
  if (!input) return ''
  let u: URL
  try {
    u = new URL(input)
  } catch {
    return input.toLowerCase()
  }

  // 非 http(s) 协议（javascript:、place:、file: 等）原样小写返回
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    return input.toLowerCase()
  }

  const protocol = u.protocol.toLowerCase()
  const host = u.hostname.toLowerCase()
  const port = u.port && u.port !== DEFAULT_PORTS[protocol] ? `:${u.port}` : ''

  // 过滤跟踪参数后排序，保证顺序无关
  const params = new URLSearchParams(u.search)
  const kept: [string, string][] = []
  for (const [k, v] of params.entries()) {
    if (!isTracking(k)) kept.push([k, v])
  }
  kept.sort((a, b) => (a[0] === b[0] ? a[1].localeCompare(b[1]) : a[0].localeCompare(b[0])))
  const search = kept.length ? '?' + kept.map(([k, v]) => `${k}=${v}`).join('&') : ''

  let path = u.pathname
  if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1)

  return `${protocol}//${host}${port}${path}${search}`
}

/** 提取主域名用于分类，如 https://a.b.github.io/x -> github.io */
export function getDomain(raw: string): string {
  try {
    const host = new URL(raw).hostname.toLowerCase()
    return host.replace(/^www\./, '')
  } catch {
    return ''
  }
}
