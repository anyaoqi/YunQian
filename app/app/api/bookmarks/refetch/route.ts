import { refetchBatchSchema } from '@/lib/server/lib/validators';
import { enqueueBatchRefetch } from '@/lib/server/services/metadata';
import { handleRouteError } from '@/lib/server/lib/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const input = refetchBatchSchema.parse(body);
    return Response.json(enqueueBatchRefetch(input.limit));
  } catch (error) {
    return handleRouteError(error);
  }
}
