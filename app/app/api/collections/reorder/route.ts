import { requireAuth } from '@/lib/server/lib/auth-context';
import { handleRouteError } from '@/lib/server/lib/errors';
import { reorderSchema } from '@/lib/server/lib/validators';
import { reorderCollections } from '@/lib/server/services/taxonomy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const user = requireAuth(request);
    const body = await request.json();
    const { parentId, orderedIds } = reorderSchema.parse(body);
    await reorderCollections(user.id, parentId, orderedIds);
    return Response.json({ ok: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
