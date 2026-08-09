import { emptyTrash, listTrashedBookmarks } from '@/lib/server/services/bookmarks';
import { handleRouteError } from '@/lib/server/lib/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return Response.json(listTrashedBookmarks());
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE() {
  try {
    return Response.json(emptyTrash());
  } catch (error) {
    return handleRouteError(error);
  }
}
