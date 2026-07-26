import { NextRequest, NextResponse } from 'next/server';
import { getCalendarStatus } from '@/app/lib/calendarAdmin';
import { getAuthUser } from '@/app/lib/auth';
import { logger } from '@/app/lib/logger';

export async function GET(req: NextRequest) {
  const { error } = await getAuthUser(req);
  if (error) return error;

  try {
    const status = await getCalendarStatus();
    return NextResponse.json(status);
  } catch (err) {
    logger.error('Calendar status error', { error: String(err) });
    return NextResponse.json({ error: 'Failed to get status' }, { status: 500 });
  }
}
