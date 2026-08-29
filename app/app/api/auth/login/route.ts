import { createAuthCookie } from '@/lib/server/lib/auth-context';
import { AppError, handleRouteError } from '@/lib/server/lib/errors';
import { clientIp, enforceRateLimit, rateLimit, resetRateLimit } from '@/lib/server/lib/rate-limit';
import { loginSchema } from '@/lib/server/lib/validators';
import { loginUser } from '@/lib/server/services/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 每 IP 每分钟登录尝试上限(防多账号碰撞/撞库)
const IP_LIMIT_PER_MINUTE = 10;
// 同一账号连续失败上限,超过则临时锁定(防针对性暴力破解)
const ACCOUNT_FAIL_LIMIT = 5;
const ACCOUNT_LOCK_MS = 15 * 60 * 1000;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const input = loginSchema.parse(body);

    const ip = clientIp(request);
    enforceRateLimit(`login:ip:${ip}`, IP_LIMIT_PER_MINUTE, 60_000, '登录尝试过于频繁,请稍后再试');

    // 每次尝试都计数,登录成功后清零,等效于「连续失败 5 次锁定 15 分钟」
    const failKey = `login:fail:${input.account.trim().toLowerCase()}`;
    const lock = rateLimit(failKey, ACCOUNT_FAIL_LIMIT, ACCOUNT_LOCK_MS);
    if (!lock.ok) {
      const minutes = Math.ceil(lock.retryAfterMs / 60_000);
      throw new AppError(429, 'ACCOUNT_LOCKED', `密码错误次数过多,该账号已被临时锁定,请约 ${minutes} 分钟后再试`, {
        retryAfterMinutes: minutes,
      });
    }

    const { user, token } = await loginUser(input);
    resetRateLimit(failKey);
    const cookieHeader = createAuthCookie(token);

    return Response.json(
      { user },
      {
        status: 200,
        headers: {
          'Set-Cookie': cookieHeader,
        },
      },
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
