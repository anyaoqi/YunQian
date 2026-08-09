import { batchMoveSchema } from '@/lib/server/lib/validators';
import { batchMoveBookmarks } from '@/lib/server/services/bookmarks';
import { handleRouteError } from '@/lib/server/lib/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const input = batchMoveSchema.parse(body);
    return Response.json(batchMoveBookmarks(input.ids, input.collectionId ?? null));
  } catch (error) {
    return handleRouteError(error);
  }
}
