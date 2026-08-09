import { z } from 'zod';
import { collectionCreateSchema } from '@/lib/server/lib/validators';
import { createCollection, listCollections } from '@/lib/server/services/taxonomy';
import { handleRouteError } from '@/lib/server/lib/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return Response.json(listCollections());
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const input = collectionCreateSchema.parse(body);
    const collection = createCollection(input);
    return Response.json(collection, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
