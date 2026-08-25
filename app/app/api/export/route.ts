import { requireAuth } from '@/lib/server/lib/auth-context';
import { handleRouteError } from '@/lib/server/lib/errors';
import { buildExport, buildHtmlExport } from '@/lib/server/services/transfer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const user = requireAuth(request);
    const { searchParams } = new URL(request.url);
    const format = searchParams.get('format') ?? 'json';
    const date = new Date().toISOString().slice(0, 10);

    if (format === 'html') {
      const html = buildHtmlExport(user.id);
      return new Response(html, {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Content-Disposition': `attachment; filename="yunqian-bookmarks-${date}.html"`,
        },
      });
    }

    const data = buildExport(user.id);
    const json = JSON.stringify(data, null, 2);
    return new Response(json, {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="yunqian-export-${date}.json"`,
      },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
