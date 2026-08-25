import { createAuthCookie } from '@/lib/server/lib/auth-context';
import { handleRouteError } from '@/lib/server/lib/errors';
import { loginSchema } from '@/lib/server/lib/validators';
import { loginUser } from '@/lib/server/services/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const input = loginSchema.parse(body);
    const { user, token } = loginUser(input);
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
