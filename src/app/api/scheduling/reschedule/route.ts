import { NextRequest, NextResponse } from 'next/server';
import { autoRescheduleBookings } from '@/app/lib/schedulingEngine';
import { getAuthUser } from '@/app/lib/auth';
import { logger } from '@/app/lib/logger';

export async function POST(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const { doctorId, date } = body;

    if (!doctorId || !date) {
      return NextResponse.json({ error: 'doctorId and date are required' }, { status: 400 });
    }

    const moves = await autoRescheduleBookings(doctorId, date);
    return NextResponse.json({ success: true, total: moves.length, moves });
  } catch (err) {
    logger.error('Auto-reschedule error', { doctorId, date: body?.date, error: String(err) });
    return NextResponse.json({ error: 'Failed to auto-reschedule' }, { status: 500 });
  }
}
