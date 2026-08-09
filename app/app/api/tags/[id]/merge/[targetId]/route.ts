import { z } from 'zod';
import { mergeTags } from '@/lib/server/services/taxonomy';
import { handleRouteError } from '@/lib/server/lib/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(_request: Request, { params }: { params: Promise<{ id: string; targetId: string }> }) {
  try {
    const { id, targetId } = await params;
    const ids = z.object({ id: z.coerce.number().int().positive(), targetId: z.coerce.number().int().positive() }).parse({ id, targetId });
    return Response.json(mergeTags(ids.id, ids.targetId));
  } catch (error) {
    return handleRouteError(error);
  }
}
