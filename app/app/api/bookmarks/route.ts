import { requireAuth } from '@/lib/server/lib/auth-context';
import { handleRouteError } from '@/lib/server/lib/errors';
import { bookmarkCreateSchema, bookmarkListSchema } from '@/lib/server/lib/validators';
import { createBookmark, listBookmarks } from '@/lib/server/services/bookmarks';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const user = await requireAuth(request);
    const { searchParams } = new URL(request.url);
    const input = bookmarkListSchema.parse(Object.fromEntries(searchParams));
    return Response.json(await listBookmarks(user.id, input));
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireAuth(request);
    const body = await request.json();
    const input = bookmarkCreateSchema.parse(body);
    const bookmark = await createBookmark(user.id, input);
    return Response.json(bookmark, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
