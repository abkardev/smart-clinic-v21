import { NextRequest, NextResponse } from 'next/server';
import { getObservability } from '@/app/lib/calendarAdmin';
import { getAuthUser } from '@/app/lib/auth';
import { logger } from '@/app/lib/logger';

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const result = await getObservability();
    return NextResponse.json(result);
  } catch (err) {
    logger.error('Observability error', { error: String(err) });
    return NextResponse.json({ error: 'Failed to get observability data' }, { status: 500 });
  }
}
