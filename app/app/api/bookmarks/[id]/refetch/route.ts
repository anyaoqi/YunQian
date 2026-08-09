import { refetchBookmark } from '@/lib/server/services/metadata';
import { handleRouteError } from '@/lib/server/lib/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = Number((await params).id);
    return Response.json(await refetchBookmark(id));
  } catch (error) {
    return handleRouteError(error);
  }
}
