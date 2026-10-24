import { requireAuth } from '@/lib/server/lib/auth-context';
import { handleRouteError } from '@/lib/server/lib/errors';
import { batchTagsSchema } from '@/lib/server/lib/validators';
import { batchAddTags } from '@/lib/server/services/bookmarks';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const user = await requireAuth(request);
    const body = await request.json();
    const { ids, tags } = batchTagsSchema.parse(body);
    return Response.json(await batchAddTags(user.id, ids, tags));
  } catch (error) {
    return handleRouteError(error);
  }
}
