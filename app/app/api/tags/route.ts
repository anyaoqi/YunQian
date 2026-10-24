import { requireAuth } from '@/lib/server/lib/auth-context';
import { handleRouteError } from '@/lib/server/lib/errors';
import { tagCreateSchema } from '@/lib/server/lib/validators';
import { createTag, listTags } from '@/lib/server/services/taxonomy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const user = await requireAuth(request);
    return Response.json(await listTags(user.id));
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireAuth(request);
    const body = await request.json();
    const input = tagCreateSchema.parse(body);
    const tag = await createTag(user.id, input);
    return Response.json(tag, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
