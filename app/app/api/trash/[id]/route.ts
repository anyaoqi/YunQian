import { requireAuth } from '@/lib/server/lib/auth-context';
import { handleRouteError } from '@/lib/server/lib/errors';
import { idParamSchema } from '@/lib/server/lib/validators';
import { permanentlyDeleteBookmark } from '@/lib/server/services/bookmarks';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = requireAuth(request);
    const { id } = idParamSchema.parse(await params);
    await permanentlyDeleteBookmark(user.id, id);
    return new Response(null, { status: 204 });
  } catch (error) {
    return handleRouteError(error);
  }
}
