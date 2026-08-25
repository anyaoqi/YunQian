import { createHmac, timingSafeEqual } from 'node:crypto';

export type JwtPayload = {
  userId: number;
  username: string;
  role: 'admin' | 'user';
  exp: number;
  iat: number;
};

const DEFAULT_SECRET = 'yunqian-jwt-secret-key-fallback-change-me-in-production';
const JWT_SECRET = process.env.JWT_SECRET || DEFAULT_SECRET;
const DEFAULT_EXPIRATION_SECONDS = 30 * 24 * 60 * 60; // 30 天

function base64UrlEncode(str: string): string {
  return Buffer.from(str, 'utf8')
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64UrlDecode(str: string): string {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  return Buffer.from(base64, 'base64').toString('utf8');
}

function createSignature(headerAndPayload: string, secret: string): string {
  return createHmac('sha256', secret)
    .update(headerAndPayload)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

/**
 * 签发 JWT Token
 */
export function signJwt(
  payload: Omit<JwtPayload, 'iat' | 'exp'>,
  expiresInSeconds = DEFAULT_EXPIRATION_SECONDS,
): string {
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + expiresInSeconds;
  const fullPayload: JwtPayload = { ...payload, iat, exp };

  const header = { alg: 'HS256', typ: 'JWT' };
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(fullPayload));
  const signature = createSignature(`${encodedHeader}.${encodedPayload}`, JWT_SECRET);

  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

/**
 * 校验并解析 JWT Token
 */
export function verifyJwt(token: string): JwtPayload | null {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [encodedHeader, encodedPayload, signature] = parts;
  const expectedSignature = createSignature(`${encodedHeader}.${encodedPayload}`, JWT_SECRET);

  const sigBuf = Buffer.from(signature);
  const expSigBuf = Buffer.from(expectedSignature);
  if (sigBuf.length !== expSigBuf.length || !timingSafeEqual(sigBuf, expSigBuf)) {
    return null;
  }

  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload)) as JwtPayload;
    const now = Math.floor(Date.now() / 1000);
    if (typeof payload.exp === 'number' && payload.exp < now) {
      return null; // 过期
    }
    if (typeof payload.userId !== 'number' || !payload.username) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}
