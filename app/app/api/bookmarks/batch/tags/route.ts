import { batchTagsSchema } from '@/lib/server/lib/validators';
import { batchAddTags } from '@/lib/server/services/bookmarks';
import { handleRouteError } from '@/lib/server/lib/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const input = batchTagsSchema.parse(body);
    return Response.json(batchAddTags(input.ids, input.tags));
  } catch (error) {
    return handleRouteError(error);
  }
}
