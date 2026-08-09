import { batchDeleteSchema } from '@/lib/server/lib/validators';
import { batchDeleteBookmarks } from '@/lib/server/services/bookmarks';
import { handleRouteError } from '@/lib/server/lib/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const input = batchDeleteSchema.parse(body);
    return Response.json(batchDeleteBookmarks(input.ids));
  } catch (error) {
    return handleRouteError(error);
  }
}
