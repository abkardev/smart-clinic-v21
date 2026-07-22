import { NextRequest, NextResponse } from 'next/server';
import { optimizeDay, optimizeWeek } from '@/app/lib/schedulingEngine';
import { getAuthUser } from '@/app/lib/auth';
import { logger } from '@/app/lib/logger';

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const doctorId = searchParams.get('doctorId');
  const date = searchParams.get('date');
  const mode = searchParams.get('mode') ?? 'day';

  if (!doctorId || !date) {
    return NextResponse.json({ error: 'doctorId and date are required' }, { status: 400 });
  }

  try {
    const result = mode === 'week' ? await optimizeWeek(doctorId, date) : await optimizeDay(doctorId, date);
    return NextResponse.json({ suggestions: result });
  } catch (err) {
    logger.error('Optimization error', { doctorId, date, mode, error: String(err) });
    return NextResponse.json({ error: 'Failed to optimize schedule' }, { status: 500 });
  }
}
