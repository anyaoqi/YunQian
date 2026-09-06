import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { AppError } from './errors';

export type JwtPayload = {
  userId: number;
  username: string;
  role: 'admin' | 'user';
  exp: number;
  iat: number;
};

const DEFAULT_EXPIRATION_SECONDS = 30 * 24 * 60 * 60; // 30 天

const DEV_FALLBACK_SECRET = 'yunqian-dev-only-secret-do-not-use-in-production';

let cachedSecret: string | null = null;

declare global {
  // Next dev 下每个 API Route 会打成独立 bundle,模块级变量互不共享;
  // 密钥必须挂在同进程共享的 globalThis 上,否则 login 签发的 token 在别的路由验签失败,
  // 首页并发请求 401 → 跳登录页 → middleware 见 cookie 又弹回首页,形成无限跳转。
  // eslint-disable-next-line no-var
  var __yunqianJwtSecret: string | undefined;
}

/**
 * 解析签名密钥。生产环境必须显式配置 JWT_SECRET,否则启动即失败——
 * 回退到固定字符串等于允许任何人伪造任意用户的登录令牌。
 * 开发环境允许回退,但每次进程重启随机生成,避免形成可预测密钥。
 */
function getSecret(): string {
  if (cachedSecret) return cachedSecret;
  if (globalThis.__yunqianJwtSecret) {
    cachedSecret = globalThis.__yunqianJwtSecret;
    return cachedSecret;
  }
  const secret = process.env.JWT_SECRET;
  if (secret && secret.length >= 32) {
    cachedSecret = secret;
    globalThis.__yunqianJwtSecret = secret;
    return cachedSecret;
  }
  if (process.env.NODE_ENV === 'production') {
    throw new AppError(
      500,
      'JWT_SECRET_MISSING',
      '生产环境未配置 JWT_SECRET(至少 32 个字符)。请在环境变量中设置后重新部署。',
    );
  }
  console.warn('[jwt] 未配置 JWT_SECRET,开发环境使用临时密钥,重启后所有登录态将失效。');
  cachedSecret = `${DEV_FALLBACK_SECRET}:${randomBytes(16).toString('hex')}`;
  globalThis.__yunqianJwtSecret = cachedSecret;
  return cachedSecret;
}

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
  const signature = createSignature(`${encodedHeader}.${encodedPayload}`, getSecret());

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
  const expectedSignature = createSignature(`${encodedHeader}.${encodedPayload}`, getSecret());

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
