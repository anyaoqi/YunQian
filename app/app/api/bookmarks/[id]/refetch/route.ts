import { requireAuth } from '@/lib/server/lib/auth-context';
import { handleRouteError } from '@/lib/server/lib/errors';
import { idParamSchema } from '@/lib/server/lib/validators';
import { refetchBookmark } from '@/lib/server/services/metadata';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = requireAuth(request);
    const { id } = idParamSchema.parse(await params);
    const bookmark = await refetchBookmark(user.id, id);
    return Response.json(bookmark);
  } catch (error) {
    return handleRouteError(error);
  }
}
