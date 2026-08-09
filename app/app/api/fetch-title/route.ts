import { fetchTitleSchema } from '@/lib/server/lib/validators';
import { AppError, handleRouteError } from '@/lib/server/lib/errors';
import { isSafePublicHttpUrl, normalizeUrl } from '@/lib/server/lib/url';
import { fetchMetadata } from '@/lib/server/services/metadata';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    if (process.env.DISABLE_FETCH_TITLE === '1') {
      return Response.json({ title: null, description: null, coverUrl: null, faviconUrl: null });
    }
    const body = await request.json();
    const input = fetchTitleSchema.parse(body);
    const url = normalizeUrl(input.url);
    if (!isSafePublicHttpUrl(url)) {
      throw new AppError(400, 'INVALID_URL', '不允许抓取本机或内网地址');
    }
    return Response.json(await fetchMetadata(url));
  } catch (error) {
    return handleRouteError(error);
  }
}
