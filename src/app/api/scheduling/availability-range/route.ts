import { NextRequest, NextResponse } from 'next/server';
import { getSmartAvailabilityRange } from '@/app/lib/schedulingEngine';
import { getAuthUser } from '@/app/lib/auth';
import { logger } from '@/app/lib/logger';

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const doctorId = searchParams.get('doctorId');
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');
  const service = searchParams.get('service') ?? undefined;

  if (!doctorId || !startDate || !endDate) {
    return NextResponse.json({ error: 'doctorId, startDate, and endDate are required' }, { status: 400 });
  }

  try {
    const result = await getSmartAvailabilityRange(doctorId, startDate, endDate, service);
    return NextResponse.json(result);
  } catch (err) {
    logger.error('Scheduling availability range error', { doctorId, startDate, endDate, error: String(err) });
    return NextResponse.json({ error: 'Failed to get availability range' }, { status: 500 });
  }
}
