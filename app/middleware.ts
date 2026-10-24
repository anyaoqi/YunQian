import { NextResponse, type NextRequest } from 'next/server';

/**
 * Edge 运行时轻量解析 JWT 的 exp 字段(不验签,仅用于打破过期/畸形 token 的跳转死循环)。
 * 签名有效性仍由各 API Route 的 verifyJwt 判定,401 时服务端/客户端会清除 stale cookie。
 * 验签需要 node:crypto,无法在 Edge middleware 中运行,故此处只做过期检查。
 */
function isTokenUsable(token: string): boolean {
  try {
    const parts = token.split('.');
    if (parts.length !== 3 || !parts[1]) return false;
    let payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    while (payload.length % 4) payload += '=';
    const json = atob(payload);
    const data = JSON.parse(json) as { exp?: unknown };
    return typeof data.exp === 'number' && data.exp * 1000 > Date.now();
  } catch {
    return false;
  }
}

/** 仅允许站内非鉴权页路径,防止开放重定向与 /login 自身回环 */
function safeRedirectTarget(raw: string | null): string | null {
  if (!raw) return null;
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return null;
  }
  // WHATWG 解析器把特殊 scheme 下的 `\` 视同 `/`:不归一化的话,
  // `/\evil.com` 不会被 `//` 检查命中,却能被 new URL 解析为外部 authority(开放重定向)。
  decoded = decoded.replace(/\\/g, '/');
  if (!decoded.startsWith('/') || decoded.startsWith('//')) return null;
  if (
    decoded === '/login' ||
    decoded.startsWith('/login?') ||
    decoded === '/register' ||
    decoded.startsWith('/register?')
  ) {
    return null;
  }
  return decoded;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 放行 API 路由、静态资源、Favicon 等
  if (
    pathname.startsWith('/api') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/fonts') ||
    pathname === '/favicon.ico' ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  const rawToken = request.cookies.get('token')?.value;
  // 仅把未过期且结构合法的 token 视为已登录;过期/畸形 token 按未登录处理,
  // 并清除 stale cookie,否则「/ → 401 → /login → /」会无限互跳。
  const token = rawToken && isTokenUsable(rawToken) ? rawToken : undefined;
  const isAuthPage = pathname === '/login' || pathname === '/register';

  if (!token && !isAuthPage) {
    const loginUrl = new URL('/login', request.url);
    if (pathname !== '/') {
      loginUrl.searchParams.set('redirect', pathname + request.nextUrl.search);
    }
    const response = NextResponse.redirect(loginUrl);
    if (rawToken) {
      response.cookies.set('token', '', { path: '/', maxAge: 0 });
    }
    return response;
  }

  if (token && isAuthPage) {
    // 已登录访问登录/注册页:优先回到 redirect 指定的安全站内地址
    const target = safeRedirectTarget(request.nextUrl.searchParams.get('redirect')) ?? '/';
    return NextResponse.redirect(new URL(target, request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
