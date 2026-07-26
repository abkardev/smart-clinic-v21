import { NextRequest, NextResponse } from 'next/server';
import { getCalendarStatistics } from '@/app/lib/calendarAdmin';
import { getAuthUser } from '@/app/lib/auth';
import { logger } from '@/app/lib/logger';

export async function GET(req: NextRequest) {
  const { error } = await getAuthUser(req);
  if (error) return error;

  try {
    const stats = await getCalendarStatistics();
    return NextResponse.json(stats);
  } catch (err) {
    logger.error('Calendar statistics error', { error: String(err) });
    return NextResponse.json({ error: 'Failed to get statistics' }, { status: 500 });
  }
}
