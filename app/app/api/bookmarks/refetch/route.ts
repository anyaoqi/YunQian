import { requireAuth } from '@/lib/server/lib/auth-context';
import { handleRouteError } from '@/lib/server/lib/errors';
import { refetchBatchSchema } from '@/lib/server/lib/validators';
import { enqueueBatchRefetch } from '@/lib/server/services/metadata';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const user = requireAuth(request);
    const body = await request.json().catch(() => ({}));
    const { limit } = refetchBatchSchema.parse(body);
    return Response.json(await enqueueBatchRefetch(user.id, limit));
  } catch (error) {
    return handleRouteError(error);
  }
}
