import { requireAuth } from '@/lib/server/lib/auth-context';
import { handleRouteError } from '@/lib/server/lib/errors';
import { enforceRateLimit } from '@/lib/server/lib/rate-limit';
import { refetchBatchSchema } from '@/lib/server/lib/validators';
import { enqueueBatchRefetch } from '@/lib/server/services/metadata';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const user = await requireAuth(request);
    // 批量补抓最多触发 limit×3 次出站请求,按用户加冷却窗口
    enforceRateLimit(`refetch-batch:${user.id}`, 3, 60_000);
    const body = await request.json().catch(() => ({}));
    const { limit } = refetchBatchSchema.parse(body);
    return Response.json(await enqueueBatchRefetch(user.id, limit));
  } catch (error) {
    return handleRouteError(error);
  }
}
