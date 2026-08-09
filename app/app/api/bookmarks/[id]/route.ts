import { bookmarkUpdateSchema } from '@/lib/server/lib/validators';
import { deleteBookmark, getBookmark, updateBookmark } from '@/lib/server/services/bookmarks';
import { handleRouteError } from '@/lib/server/lib/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function parseId(params: Promise<{ id: string }>): Promise<number> {
  return Number((await params).id);
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = await parseId(params);
    return Response.json(getBookmark(id));
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = await parseId(params);
    const body = await request.json();
    const input = bookmarkUpdateSchema.parse(body);
    return Response.json(updateBookmark(id, input));
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = await parseId(params);
    deleteBookmark(id);
    return new Response(null, { status: 204 });
  } catch (error) {
    return handleRouteError(error);
  }
}
