import { requireAuth } from '@/lib/server/lib/auth-context';
import { handleRouteError } from '@/lib/server/lib/errors';
import { enforceRateLimit } from '@/lib/server/lib/rate-limit';
import { fetchTitleSchema } from '@/lib/server/lib/validators';
import { fetchMetadata } from '@/lib/server/services/metadata';
import { assertSafePublicHttpUrl, normalizeUrl } from '@/lib/server/lib/url';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const user = await requireAuth(request);
    // 该端点会让服务器发起出站请求,按用户限流防止被当作内网探测/带宽放大的跳板
    enforceRateLimit(`fetch-title:${user.id}`, 20, 60_000);
    const body = await request.json();
    const { url } = fetchTitleSchema.parse(body);
    // 在路由层先给出明确错误(内网地址/无法解析),而不是静默返回空元数据
    await assertSafePublicHttpUrl(normalizeUrl(url));
    const meta = await fetchMetadata(url);
    return Response.json(meta);
  } catch (error) {
    return handleRouteError(error);
  }
}
