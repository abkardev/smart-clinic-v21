import { NextRequest, NextResponse } from 'next/server';
import { autoRescheduleBookings } from '@/app/lib/schedulingEngine';
import { getAuthUser } from '@/app/lib/auth';
import { logger } from '@/app/lib/logger';

export async function POST(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (auth.error) return auth.error;

  const user = auth.user;

  try {
    const body: Record<string, unknown> = await req.json();
    const doctorId = typeof body.doctorId === 'string' ? body.doctorId : '';
    const date = typeof body.date === 'string' ? body.date : '';

    if (!doctorId || !date) {
      return NextResponse.json({ error: 'doctorId and date are required' }, { status: 400 });
    }

    const moves = await autoRescheduleBookings(doctorId, date);
    return NextResponse.json({ success: true, total: moves.length, moves });
  } catch (err) {
    logger.error('Auto-reschedule error', { error: String(err) });
    return NextResponse.json({ error: 'Failed to auto-reschedule' }, { status: 500 });
  }
}
