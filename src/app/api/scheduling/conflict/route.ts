import { NextRequest, NextResponse } from 'next/server';
import { resolveConflict } from '@/app/lib/schedulingEngine';
import { getAuthUser } from '@/app/lib/auth';
import { logger } from '@/app/lib/logger';

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const doctorId = searchParams.get('doctorId');
  const date = searchParams.get('date');
  const time = searchParams.get('time');
  const service = searchParams.get('service') ?? undefined;
  const priority = searchParams.get('priority') ?? undefined;

  if (!doctorId || !date || !time) {
    return NextResponse.json({ error: 'doctorId, date, and time are required' }, { status: 400 });
  }

  try {
    const result = await resolveConflict(doctorId, date, time, service, priority);
    return NextResponse.json(result);
  } catch (err) {
    logger.error('Conflict resolution error', { doctorId, date, time, error: String(err) });
    return NextResponse.json({ error: 'Failed to resolve conflict' }, { status: 500 });
  }
}
