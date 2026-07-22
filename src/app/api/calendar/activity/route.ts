import { NextRequest, NextResponse } from 'next/server';
import { getCalendarActivity } from '@/app/lib/calendarAdmin';
import { getAuthUser } from '@/app/lib/auth';
import { logger } from '@/app/lib/logger';

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const limit = Math.min(parseInt(req.nextUrl.searchParams.get('limit') ?? '100', 10), 1000);
    const cursor = req.nextUrl.searchParams.get('cursor') ?? undefined;
    const activity = await getCalendarActivity(limit, cursor);
    return NextResponse.json(activity);
  } catch (err) {
    logger.error('Calendar activity error', { error: String(err) });
    return NextResponse.json({ error: 'Failed to get activity' }, { status: 500 });
  }
}
