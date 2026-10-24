import { requireAuth } from '@/lib/server/lib/auth-context';
import { handleRouteError } from '@/lib/server/lib/errors';
import { passwordChangeSchema } from '@/lib/server/lib/validators';
import { changePassword } from '@/lib/server/services/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const authUser = await requireAuth(request);
    const body = await request.json();
    const input = passwordChangeSchema.parse(body);
    await changePassword(authUser.id, input.oldPassword, input.newPassword);
    return Response.json({ success: true, ok: true }, { status: 200 });
  } catch (error) {
    return handleRouteError(error);
  }
}
