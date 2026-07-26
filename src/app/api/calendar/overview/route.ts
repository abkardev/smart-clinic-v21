import { NextRequest, NextResponse } from 'next/server';
import { getCalendarStatus } from '@/app/lib/calendarAdmin';
import { getCalendarStatistics } from '@/app/lib/calendarAdmin';
import { getCalendarActivity } from '@/app/lib/calendarAdmin';
import { getConflicts } from '@/app/lib/calendarAdmin';
import { getAuthUser } from '@/app/lib/auth';
import { logger } from '@/app/lib/logger';

export async function GET(req: NextRequest) {
  const { error } = await getAuthUser(req);
  if (error) return error;

  try {
    const [status, stats, activity, conflicts] = await Promise.all([
      getCalendarStatus(),
      getCalendarStatistics(),
      getCalendarActivity(10),
      getConflicts({ pageSize: 10 }),
    ]);

    return NextResponse.json({
      status,
      stats,
      recentActivity: activity,
      recentConflicts: conflicts,
    });
  } catch (err) {
    logger.error('Calendar overview error', { error: String(err) });
    return NextResponse.json({ error: 'Failed to load overview' }, { status: 500 });
  }
}
