import { NextRequest, NextResponse } from 'next/server';
import { getSchedulingAnalytics } from '@/app/lib/schedulingEngine';
import { getAuthUser } from '@/app/lib/auth';
import { logger } from '@/app/lib/logger';

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const doctorId = searchParams.get('doctorId') ?? undefined;
  const days = parseInt(searchParams.get('days') ?? '30', 10);

  try {
    const analytics = await getSchedulingAnalytics(doctorId, days);
    return NextResponse.json(analytics);
  } catch (err) {
    logger.error('Scheduling analytics error', { doctorId, days, error: String(err) });
    return NextResponse.json({ error: 'Failed to get analytics' }, { status: 500 });
  }
}
