import { requireAuth } from '@/lib/server/lib/auth-context';
import { handleRouteError } from '@/lib/server/lib/errors';
import { cleanOrphanTags } from '@/lib/server/services/taxonomy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const user = requireAuth(request);
    return Response.json(cleanOrphanTags(user.id));
  } catch (error) {
    return handleRouteError(error);
  }
}
