import { NextRequest, NextResponse } from 'next/server';
import { getConflicts } from '@/app/lib/calendarAdmin';
import { getAuthUser } from '@/app/lib/auth';
import { logger } from '@/app/lib/logger';

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const doctorId = req.nextUrl.searchParams.get('doctorId') ?? undefined;
    const type = req.nextUrl.searchParams.get('type') ?? undefined;
    const page = parseInt(req.nextUrl.searchParams.get('page') ?? '1', 10);
    const pageSize = Math.min(parseInt(req.nextUrl.searchParams.get('pageSize') ?? '50', 10), 200);

    const result = await getConflicts({ doctorId, type, page, pageSize });
    return NextResponse.json(result);
  } catch (err) {
    logger.error('Calendar conflicts error', { error: String(err) });
    return NextResponse.json({ error: 'Failed to get conflicts' }, { status: 500 });
  }
}
