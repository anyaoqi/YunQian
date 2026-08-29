import { checkDatabaseConnection } from '@/lib/server/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await checkDatabaseConnection();
    return Response.json({ ok: true, db: 'up' });
  } catch (error) {
    console.error('[health] 数据库探活失败:', error);
    return Response.json({ ok: false, db: 'down' }, { status: 503 });
  }
}
