import { buildExport, buildHtmlExport } from '@/lib/server/services/transfer';
import { handleRouteError } from '@/lib/server/lib/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const date = new Date().toISOString().slice(0, 10);
    if (searchParams.get('format') === 'html') {
      const html = buildHtmlExport();
      return new Response(html, {
        headers: {
          'Content-Type': 'text/html; charset=UTF-8',
          'Content-Disposition': `attachment; filename="yunqian-export-${date}.html"`,
        },
      });
    }
    return new Response(JSON.stringify(buildExport(), null, 2), {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="yunqian-export-${date}.json"`,
      },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
