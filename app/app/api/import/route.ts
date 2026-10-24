import { requireAuth } from '@/lib/server/lib/auth-context';
import { handleRouteError } from '@/lib/server/lib/errors';
import { importBodySchema } from '@/lib/server/lib/validators';
import { importBookmarkFile } from '@/lib/server/services/transfer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const user = await requireAuth(request);
    const contentType = request.headers.get('content-type') ?? '';
    if (contentType.includes('text/plain')) {
      const html = await request.text();
      return Response.json(await importBookmarkFile(user.id, { content: html, format: 'netscape', mode: 'skip' }));
    }
    const body = await request.json();
    const input = importBodySchema.parse(body);
    return Response.json(await importBookmarkFile(user.id, { content: input.html, format: input.format, collectionId: input.collectionId, mode: input.mode }));
  } catch (error) {
    return handleRouteError(error);
  }
}
