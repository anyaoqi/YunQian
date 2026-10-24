import { createLogoutCookie } from '@/lib/server/lib/auth-context';
import { handleRouteError } from '@/lib/server/lib/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const cookieHeader = createLogoutCookie(request);
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
