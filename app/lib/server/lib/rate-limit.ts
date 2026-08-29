import { AppError } from './errors';

/**
 * 进程内滑动窗口限流器。
 * 适用当前单实例部署(Railway 单副本);若将来扩容到多副本,
 * 需要改用 Redis 等跨实例共享存储,否则每副本各自计数。
 */

const hits = new Map<string, number[]>();
const MAX_KEYS = 10_000;
const MAX_WINDOW_MS = 24 * 60 * 60 * 1000;

function sweepExpired(now: number): void {
  for (const [key, timestamps] of hits) {
    const alive = timestamps.filter((t) => now - t < MAX_WINDOW_MS);
    if (alive.length === 0) hits.delete(key);
    else if (alive.length !== timestamps.length) hits.set(key, alive);
  }
}

/**
 * 记录一次命中并判断是否放行。
 * 每次调用都会计数(即成功与失败都算一次),调用方可在业务成功后
 * 用 resetRateLimit 清零(例如登录成功后清除该账号的失败计数)。
 */
export function rateLimit(key: string, limit: number, windowMs: number): { ok: boolean; retryAfterMs: number } {
  const now = Date.now();
  if (hits.size > MAX_KEYS) sweepExpired(now);
  const alive = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (alive.length >= limit) {
    hits.set(key, alive);
    return { ok: false, retryAfterMs: Math.max(alive[0] + windowMs - now, 1000) };
  }
  alive.push(now);
  hits.set(key, alive);
  return { ok: true, retryAfterMs: 0 };
}

export function resetRateLimit(key: string): void {
  hits.delete(key);
}

export function enforceRateLimit(key: string, limit: number, windowMs: number, message?: string): void {
  const result = rateLimit(key, limit, windowMs);
  if (!result.ok) {
    const seconds = Math.ceil(result.retryAfterMs / 1000);
    throw new AppError(429, 'RATE_LIMITED', message ?? `请求过于频繁,请 ${seconds} 秒后再试`, { retryAfterSeconds: seconds });
  }
}

/** 取客户端 IP。Railway 等反向代理会注入 X-Forwarded-For,取第一个即真实客户端。 */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return request.headers.get('x-real-ip')?.trim() || 'unknown';
}
