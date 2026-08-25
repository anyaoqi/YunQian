import { requireAuth } from '@/lib/server/lib/auth-context';
import { handleRouteError } from '@/lib/server/lib/errors';
import { emptyTrash, listTrashedBookmarks } from '@/lib/server/services/bookmarks';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const user = requireAuth(request);
    return Response.json(listTrashedBookmarks(user.id));
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const user = requireAuth(request);
    return Response.json(emptyTrash(user.id));
  } catch (error) {
    return handleRouteError(error);
  }
}
