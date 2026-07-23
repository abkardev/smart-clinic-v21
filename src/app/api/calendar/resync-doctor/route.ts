import { NextRequest, NextResponse } from 'next/server';
import { resyncDoctor } from '@/app/lib/calendarAdmin';
import { getAuthUser, requireRole } from '@/app/lib/auth';
import { logger } from '@/app/lib/logger';

export async function POST(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (auth.error) return auth.error;

  const roleErr = requireRole(auth.user, 'superadmin', 'admin');
  if (roleErr) return roleErr;

  try {
    const body = await req.json();
    const { doctorId } = body;
    if (!doctorId) return NextResponse.json({ error: 'doctorId required' }, { status: 400 });

    const requestId = `rsd-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const result = await resyncDoctor(doctorId, requestId);
    return NextResponse.json({ requestId: result.requestId, doctorId: result.doctorId, total: result.total });
  } catch (err) {
    logger.error('Resync doctor error', { error: String(err) });
    const msg = (err as Error).message;
    return NextResponse.json({ error: msg }, { status: msg.includes('not found') ? 404 : 500 });
  }
}
