import { NextRequest, NextResponse } from 'next/server';
import { allocateEmergencySlot } from '@/app/lib/schedulingEngine';
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

    const result = await allocateEmergencySlot(doctorId, date);
    if (!result) {
      return NextResponse.json({ error: 'No slot available even after bumping regular bookings' }, { status: 409 });
    }

    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    logger.error('Priority allocation error', { error: String(err) });
    return NextResponse.json({ error: 'Failed to allocate priority slot' }, { status: 500 });
  }
}
