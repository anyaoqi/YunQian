import { reorderSchema } from '@/lib/server/lib/validators';
import { reorderCollections } from '@/lib/server/services/taxonomy';
import { handleRouteError } from '@/lib/server/lib/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const input = reorderSchema.parse(body);
    reorderCollections(input.parentId, input.orderedIds);
    return Response.json({ ok: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
