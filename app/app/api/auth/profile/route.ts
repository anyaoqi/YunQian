import { requireAuth } from '@/lib/server/lib/auth-context';
import { handleRouteError } from '@/lib/server/lib/errors';
import { profileUpdateSchema } from '@/lib/server/lib/validators';
import { updateUserProfile } from '@/lib/server/services/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PATCH(request: Request) {
  try {
    const authUser = requireAuth(request);
    const body = await request.json();
    const input = profileUpdateSchema.parse(body);
    const updatedUser = await updateUserProfile(authUser.id, input);
    return Response.json({ user: updatedUser }, { status: 200 });
  } catch (error) {
    return handleRouteError(error);
  }
}
