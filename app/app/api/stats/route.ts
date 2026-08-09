import { getStats } from '@/lib/server/services/bookmarks';
import { handleRouteError } from '@/lib/server/lib/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return Response.json(getStats());
  } catch (error) {
    return handleRouteError(error);
  }
}
