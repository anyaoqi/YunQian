import { cleanOrphanTags } from '@/lib/server/services/taxonomy';
import { handleRouteError } from '@/lib/server/lib/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    return Response.json(cleanOrphanTags());
  } catch (error) {
    return handleRouteError(error);
  }
}
