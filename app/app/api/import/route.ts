import { importBodySchema } from '@/lib/server/lib/validators';
import { parsePocketHtml, parseRaindropCsv, parseTobyJson } from '@/lib/server/lib/importers';
import { enqueueBatchRefetch } from '@/lib/server/services/metadata';
import { importBookmarks, importNetscapeHtml } from '@/lib/server/services/transfer';
import { handleRouteError } from '@/lib/server/lib/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get('content-type') ?? '';
    let payload: unknown;
    if (contentType.includes('application/json')) {
      payload = await request.json();
    } else {
      payload = { html: await request.text() };
    }
    const input = importBodySchema.parse(payload);
    const format = (input.format ?? 'netscape') as 'netscape' | 'raindrop' | 'toby' | 'pocket';
    const options = { collectionId: input.collectionId, mode: input.mode };
    let result;
    if (format === 'netscape') {
      result = importNetscapeHtml({ html: input.html, ...options });
    } else if (format === 'raindrop') {
      result = importBookmarks(parseRaindropCsv(input.html), options);
    } else if (format === 'toby') {
      result = importBookmarks(parseTobyJson(input.html), options);
    } else {
      result = importBookmarks(parsePocketHtml(input.html), options);
    }
    enqueueBatchRefetch();
    return Response.json(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
