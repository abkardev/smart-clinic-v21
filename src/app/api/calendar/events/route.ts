import { NextRequest, NextResponse } from 'next/server';
import { searchCalendarEvents } from '@/app/lib/calendarAdmin';
import { getAuthUser } from '@/app/lib/auth';
import { logger } from '@/app/lib/logger';

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const doctorId = req.nextUrl.searchParams.get('doctorId') ?? undefined;
    const date = req.nextUrl.searchParams.get('date') ?? undefined;
    const status = req.nextUrl.searchParams.get('status') ?? undefined;
    const query = req.nextUrl.searchParams.get('query') ?? undefined;
    const bookingId = req.nextUrl.searchParams.get('bookingId') ?? undefined;
    const googleEventId = req.nextUrl.searchParams.get('googleEventId') ?? undefined;
    const page = parseInt(req.nextUrl.searchParams.get('page') ?? '1', 10);
    const pageSize = Math.min(parseInt(req.nextUrl.searchParams.get('pageSize') ?? '50', 10), 200);
    const sortBy = req.nextUrl.searchParams.get('sortBy') ?? 'date';
    const sortOrder = (req.nextUrl.searchParams.get('sortOrder') ?? 'desc') as 'asc' | 'desc';

    const result = await searchCalendarEvents({ doctorId, date, status, query, bookingId, googleEventId, page, pageSize, sortBy, sortOrder });
    return NextResponse.json(result);
  } catch (err) {
    logger.error('Calendar events search error', { error: String(err) });
    return NextResponse.json({ error: 'Search failed' }, { status: 500 });
  }
}
