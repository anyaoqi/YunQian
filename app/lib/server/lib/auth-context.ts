import { AppError } from './errors';
import { verifyJwt } from './jwt';

export const AUTH_COOKIE_NAME = 'token';

export type AuthUser = {
  id: number;
  username: string;
  role: 'admin' | 'user';
};

/**
 * 判断本次请求是否经由 HTTPS 到达。反代(如 Caddy/Nginx)终止 TLS 时源站看到的是 HTTP,
 * 以 x-forwarded-proto 为准;直连时回退看请求 URL 自身的协议。
 * 带 Secure 的 cookie 在纯 HTTP 站点上会被浏览器直接丢弃,导致登录成功却拿不到登录态。
 */
export function isHttpsRequest(request: Request): boolean {
  const forwardedProto = request.headers.get('x-forwarded-proto');
  if (forwardedProto) {
    return forwardedProto.split(',')[0].trim() === 'https';
  }
  try {
    return new URL(request.url).protocol === 'https:';
  } catch {
    return false;
  }
}

export function createAuthCookie(token: string, request: Request, maxAgeSeconds = 30 * 24 * 60 * 60): string {
  const flags = [
    `${AUTH_COOKIE_NAME}=${token}`,
    `Path=/`,
    `Max-Age=${maxAgeSeconds}`,
    `HttpOnly`,
    `SameSite=Lax`,
  ];
  if (isHttpsRequest(request)) {
    flags.push('Secure');
  }
  return flags.join('; ');
}

export function createLogoutCookie(request: Request): string {
  const flags = [
    `${AUTH_COOKIE_NAME}=`,
    `Path=/`,
    `Max-Age=0`,
    `HttpOnly`,
    `SameSite=Lax`,
  ];
  if (isHttpsRequest(request)) {
    flags.push('Secure');
  }
  return flags.join('; ');
}

export function extractTokenFromRequest(request: Request): string | null {
  const cookieHeader = request.headers.get('cookie');
  if (cookieHeader) {
    const cookies = cookieHeader.split(';').map((c) => c.trim());
    for (const cookie of cookies) {
      const [name, ...rest] = cookie.split('=');
      if (name === AUTH_COOKIE_NAME) {
        return rest.join('=');
      }
    }
  }
  const authHeader = request.headers.get('authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  return null;
}

export function getAuthUser(request: Request): AuthUser | null {
  const token = extractTokenFromRequest(request);
  if (!token) return null;
  const payload = verifyJwt(token);
  if (!payload) return null;
  return { id: payload.userId, username: payload.username, role: payload.role };
}

export function requireAuth(request: Request): AuthUser {
  const user = getAuthUser(request);
  if (!user) {
    throw new AppError(401, 'UNAUTHORIZED', '请先登录后再进行操作');
  }
  return user;
}
