import { createLogoutCookie } from '@/lib/server/lib/auth-context';
import { handleRouteError } from '@/lib/server/lib/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const cookieHeader = createLogoutCookie();
    return Response.json(
      { success: true },
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
