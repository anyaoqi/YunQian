import { requireAuth } from '@/lib/server/lib/auth-context';
import { handleRouteError } from '@/lib/server/lib/errors';
import { collectionCreateSchema } from '@/lib/server/lib/validators';
import { createCollection, listCollections } from '@/lib/server/services/taxonomy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const user = requireAuth(request);
    return Response.json(await listCollections(user.id));
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = requireAuth(request);
    const body = await request.json();
    const input = collectionCreateSchema.parse(body);
    const collection = await createCollection(user.id, input);
    return Response.json(collection, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
