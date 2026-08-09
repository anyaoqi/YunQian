import { tagCreateSchema } from '@/lib/server/lib/validators';
import { deleteTag, updateTag } from '@/lib/server/services/taxonomy';
import { AppError, handleRouteError } from '@/lib/server/lib/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function parseId(params: Promise<{ id: string }>): Promise<number> {
  const parsed = Number((await params).id);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new AppError(400, 'INVALID_ID', 'id 参数不合法');
  return parsed;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = await parseId(params);
    const body = await request.json();
    const input = tagCreateSchema.partial().parse(body);
    return Response.json(updateTag(id, input));
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = await parseId(params);
    deleteTag(id);
    return new Response(null, { status: 204 });
  } catch (error) {
    return handleRouteError(error);
  }
}
