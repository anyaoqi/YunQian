import { requireAuth } from '@/lib/server/lib/auth-context';
import { handleRouteError } from '@/lib/server/lib/errors';
import { idParamSchema } from '@/lib/server/lib/validators';
import { mergeTags } from '@/lib/server/services/taxonomy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; targetId: string }> },
) {
  try {
    const user = requireAuth(request);
    const resolved = await params;
    const { id: sourceId } = idParamSchema.parse({ id: resolved.id });
    const { id: targetId } = idParamSchema.parse({ id: resolved.targetId });
    return Response.json(mergeTags(user.id, sourceId, targetId));
  } catch (error) {
    return handleRouteError(error);
  }
}
