import { NextRequest, NextResponse } from 'next/server';
import { getCalendarStatus } from '@/app/lib/calendarAdmin';
import { getAuthUser } from '@/app/lib/auth';
import { logger } from '@/app/lib/logger';

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const status = await getCalendarStatus();
    return NextResponse.json(status);
  } catch (err) {
    logger.error('Calendar status error', { error: String(err) });
    return NextResponse.json({ error: 'Failed to get status' }, { status: 500 });
  }
}
