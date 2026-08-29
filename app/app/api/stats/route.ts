import { requireAuth } from '@/lib/server/lib/auth-context';
import { handleRouteError } from '@/lib/server/lib/errors';
import { getStats } from '@/lib/server/services/bookmarks';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const user = requireAuth(request);
    return Response.json(await getStats(user.id));
  } catch (error) {
    return handleRouteError(error);
  }
}
