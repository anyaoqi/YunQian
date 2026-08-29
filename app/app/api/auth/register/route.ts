import { createAuthCookie } from '@/lib/server/lib/auth-context';
import { handleRouteError } from '@/lib/server/lib/errors';
import { clientIp, enforceRateLimit } from '@/lib/server/lib/rate-limit';
import { registerSchema } from '@/lib/server/lib/validators';
import { registerUser } from '@/lib/server/services/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 每 IP 每小时注册上限,防止批量灌号
const REGISTER_LIMIT_PER_HOUR = 10;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const input = registerSchema.parse(body);

    const ip = clientIp(request);
    enforceRateLimit(`register:ip:${ip}`, REGISTER_LIMIT_PER_HOUR, 60 * 60 * 1000, '注册请求过于频繁,请稍后再试');

    const { user, token } = await registerUser(input);
    const cookieHeader = createAuthCookie(token);

    return Response.json(
      { user },
      {
        status: 201,
        headers: {
          'Set-Cookie': cookieHeader,
        },
      },
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
