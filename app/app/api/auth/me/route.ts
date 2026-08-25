import { getAuthUser } from '@/lib/server/lib/auth-context';
import { handleRouteError } from '@/lib/server/lib/errors';
import { getUserById } from '@/lib/server/services/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const authUser = getAuthUser(request);
    if (!authUser) {
      return Response.json({ user: null }, { status: 200 });
    }
    const user = getUserById(authUser.id);
    return Response.json({ user });
  } catch (error) {
    return handleRouteError(error);
  }
}
