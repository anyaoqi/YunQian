import { AppError } from './errors';
import { verifyJwt } from './jwt';

export const AUTH_COOKIE_NAME = 'token';

export type AuthUser = {
  id: number;
  username: string;
  role: 'admin' | 'user';
};

export function createAuthCookie(token: string, maxAgeSeconds = 30 * 24 * 60 * 60): string {
  const isProd = process.env.NODE_ENV === 'production';
  const flags = [
    `${AUTH_COOKIE_NAME}=${token}`,
    `Path=/`,
    `Max-Age=${maxAgeSeconds}`,
    `HttpOnly`,
    `SameSite=Lax`,
  ];
  if (isProd) {
    flags.push('Secure');
  }
  return flags.join('; ');
}

export function createLogoutCookie(): string {
  const isProd = process.env.NODE_ENV === 'production';
  const flags = [
    `${AUTH_COOKIE_NAME}=`,
    `Path=/`,
    `Max-Age=0`,
    `HttpOnly`,
    `SameSite=Lax`,
  ];
  if (isProd) {
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
