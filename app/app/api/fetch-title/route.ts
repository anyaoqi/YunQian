import { requireAuth } from '@/lib/server/lib/auth-context';
import { handleRouteError } from '@/lib/server/lib/errors';
import { fetchTitleSchema } from '@/lib/server/lib/validators';
import { fetchMetadata } from '@/lib/server/services/metadata';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    requireAuth(request);
    const body = await request.json();
    const { url } = fetchTitleSchema.parse(body);
    const meta = await fetchMetadata(url);
    return Response.json(meta);
  } catch (error) {
    return handleRouteError(error);
  }
}
