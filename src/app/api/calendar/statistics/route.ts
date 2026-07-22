import { NextRequest, NextResponse } from 'next/server';
import { getCalendarStatistics } from '@/app/lib/calendarAdmin';
import { getAuthUser } from '@/app/lib/auth';
import { logger } from '@/app/lib/logger';

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const stats = await getCalendarStatistics();
    return NextResponse.json(stats);
  } catch (err) {
    logger.error('Calendar statistics error', { error: String(err) });
    return NextResponse.json({ error: 'Failed to get statistics' }, { status: 500 });
  }
}
