import { NextRequest, NextResponse } from 'next/server';
import { resyncBooking } from '@/app/lib/calendarAdmin';
import { getAuthUser, requireRole } from '@/app/lib/auth';
import { logger } from '@/app/lib/logger';

export async function POST(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (auth.error) return auth.error;

  const roleErr = requireRole(auth.user, 'superadmin', 'admin');
  if (roleErr) return roleErr;

  try {
    const body = await req.json();
    const { bookingId } = body;
    if (!bookingId) return NextResponse.json({ error: 'bookingId required' }, { status: 400 });

    const requestId = `rsb-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const result = await resyncBooking(bookingId, requestId);
    return NextResponse.json(result);
  } catch (err) {
    logger.error('Resync booking error', { error: String(err) });
    const msg = (err as Error).message;
    const status = msg.includes('not found') ? 404 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
