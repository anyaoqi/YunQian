import { refetchBookmark } from '@/lib/server/services/metadata';
import { AppError, handleRouteError } from '@/lib/server/lib/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = Number((await params).id);
    if (!Number.isInteger(id) || id <= 0) throw new AppError(400, 'INVALID_ID', 'id 参数不合法');
    return Response.json(await refetchBookmark(id));
  } catch (error) {
    return handleRouteError(error);
  }
}
