import { requireAuth } from '@/lib/server/lib/auth-context';
import { handleRouteError } from '@/lib/server/lib/errors';
import { batchDeleteSchema } from '@/lib/server/lib/validators';
import { batchDeleteBookmarks } from '@/lib/server/services/bookmarks';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const user = await requireAuth(request);
    const body = await request.json();
    const { ids } = batchDeleteSchema.parse(body);
    return Response.json(await batchDeleteBookmarks(user.id, ids));
  } catch (error) {
    return handleRouteError(error);
  }
}
