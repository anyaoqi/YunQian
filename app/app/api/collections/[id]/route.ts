import { requireAuth } from '@/lib/server/lib/auth-context';
import { handleRouteError } from '@/lib/server/lib/errors';
import { collectionUpdateSchema, idParamSchema } from '@/lib/server/lib/validators';
import { deleteCollection, updateCollection } from '@/lib/server/services/taxonomy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = requireAuth(request);
    const { id } = idParamSchema.parse(await params);
    const body = await request.json();
    const input = collectionUpdateSchema.parse(body);
    return Response.json(updateCollection(user.id, id, input));
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = requireAuth(request);
    const { id } = idParamSchema.parse(await params);
    deleteCollection(user.id, id);
    return new Response(null, { status: 204 });
  } catch (error) {
    return handleRouteError(error);
  }
}
