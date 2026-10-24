import { requireAuth } from '@/lib/server/lib/auth-context';
import { handleRouteError } from '@/lib/server/lib/errors';
import { batchMoveSchema } from '@/lib/server/lib/validators';
import { batchMoveBookmarks } from '@/lib/server/services/bookmarks';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const user = await requireAuth(request);
    const body = await request.json();
    const { ids, collectionId } = batchMoveSchema.parse(body);
    return Response.json(await batchMoveBookmarks(user.id, ids, collectionId ?? null));
  } catch (error) {
    return handleRouteError(error);
  }
}
