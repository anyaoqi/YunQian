import { createLogoutCookie, extractTokenFromRequest, getAuthUser } from '@/lib/server/lib/auth-context';
import { handleRouteError } from '@/lib/server/lib/errors';
import { getUserById } from '@/lib/server/services/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const authUser = getAuthUser(request);
    if (!authUser) {
      // 携带了 token 但校验失败(过期/伪造/密钥轮换):返回 401 并清除 stale cookie,
      // 否则浏览器残留无效 cookie 会导致「/ ⇄ /login」无限互跳。
      // 无 token 的首次访问仍返回 200 null,避免登录页被全局 401 拦截误伤。
      if (extractTokenFromRequest(request)) {
        return Response.json({ user: null }, { status: 401, headers: { 'Set-Cookie': createLogoutCookie(request) } });
      }
      return Response.json({ user: null }, { status: 200 });
    }
    const user = await getUserById(authUser.id);
    return Response.json({ user });
  } catch (error) {
    return handleRouteError(error);
  }
}
