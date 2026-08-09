import { tagCreateSchema } from '@/lib/server/lib/validators';
import { createTag, listTags } from '@/lib/server/services/taxonomy';
import { handleRouteError } from '@/lib/server/lib/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return Response.json(listTags());
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const input = tagCreateSchema.parse(body);
    const tag = createTag(input);
    return Response.json(tag, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
