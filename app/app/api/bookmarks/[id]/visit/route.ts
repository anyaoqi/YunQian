import { visitBookmark } from '@/lib/server/services/bookmarks';
import { handleRouteError } from '@/lib/server/lib/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = Number((await params).id);
    return Response.json({ clickCount: visitBookmark(id) });
  } catch (error) {
    return handleRouteError(error);
  }
}
