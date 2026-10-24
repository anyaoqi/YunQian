/** 登录/注册成功后的站内安全跳转目标,非法或自指鉴权页时回落到首页 */
export function safeRedirectTarget(raw: string | null): string {
  if (!raw) return '/';
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return '/';
  }
  // 与 middleware 保持一致:先把 `\` 归一化为 `/`,防止 `/\evil.com` 绕过 `//` 检查
  decoded = decoded.replace(/\\/g, '/');
  if (!decoded.startsWith('/') || decoded.startsWith('//')) return '/';
  if (
    decoded === '/login' ||
    decoded.startsWith('/login?') ||
    decoded === '/register' ||
    decoded.startsWith('/register?')
  ) {
    return '/';
  }
  return decoded;
}
