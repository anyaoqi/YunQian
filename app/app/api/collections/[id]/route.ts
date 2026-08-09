import { collectionUpdateSchema } from '@/lib/server/lib/validators';
import { deleteCollection, updateCollection } from '@/lib/server/services/taxonomy';
import { handleRouteError } from '@/lib/server/lib/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function parseId(params: Promise<{ id: string }>): Promise<number> {
  const { id } = await params;
  const parsed = Number(id);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error('Invalid id');
  return parsed;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = await parseId(params);
    const body = await request.json();
    const input = collectionUpdateSchema.parse(body);
    return Response.json(updateCollection(id, input));
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = await parseId(params);
    deleteCollection(id);
    return new Response(null, { status: 204 });
  } catch (error) {
    return handleRouteError(error);
  }
}
