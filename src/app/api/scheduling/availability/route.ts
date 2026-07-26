import { NextRequest, NextResponse } from 'next/server';
import { getSmartAvailability } from '@/app/lib/schedulingEngine';
import { getAuthUser } from '@/app/lib/auth';
import { logger } from '@/app/lib/logger';

export async function GET(req: NextRequest) {
  const { error } = await getAuthUser(req);
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const doctorId = searchParams.get('doctorId');
  const date = searchParams.get('date');
  const service = searchParams.get('service') ?? undefined;

  if (!doctorId || !date) {
    return NextResponse.json({ error: 'doctorId and date are required' }, { status: 400 });
  }

  try {
    const result = await getSmartAvailability(doctorId, date, service);
    return NextResponse.json(result);
  } catch (err) {
    logger.error('Scheduling availability error', { doctorId, date, error: String(err) });
    return NextResponse.json({ error: 'Failed to get availability' }, { status: 500 });
  }
}
