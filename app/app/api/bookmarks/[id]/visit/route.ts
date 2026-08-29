import { requireAuth } from '@/lib/server/lib/auth-context';
import { handleRouteError } from '@/lib/server/lib/errors';
import { idParamSchema } from '@/lib/server/lib/validators';
import { visitBookmark } from '@/lib/server/services/bookmarks';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = requireAuth(request);
    const { id } = idParamSchema.parse(await params);
    const clickCount = await visitBookmark(user.id, id);
    return Response.json({ clickCount });
  } catch (error) {
    return handleRouteError(error);
  }
}
