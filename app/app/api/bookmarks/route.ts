import { bookmarkCreateSchema, bookmarkListSchema } from '@/lib/server/lib/validators';
import { createBookmark, listBookmarks } from '@/lib/server/services/bookmarks';
import { handleRouteError } from '@/lib/server/lib/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const input = bookmarkListSchema.parse(Object.fromEntries(searchParams));
    return Response.json(listBookmarks(input));
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const input = bookmarkCreateSchema.parse(body);
    const bookmark = createBookmark(input);
    return Response.json(bookmark, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
