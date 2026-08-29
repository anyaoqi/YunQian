import { requireAuth } from '@/lib/server/lib/auth-context';
import { handleRouteError } from '@/lib/server/lib/errors';
import { idParamSchema } from '@/lib/server/lib/validators';
import { restoreBookmark } from '@/lib/server/services/bookmarks';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = requireAuth(request);
    const { id } = idParamSchema.parse(await params);
    return Response.json(await restoreBookmark(user.id, id));
  } catch (error) {
    return handleRouteError(error);
  }
}
