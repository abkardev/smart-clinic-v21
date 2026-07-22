import { NextRequest, NextResponse } from 'next/server';
import { fullResync } from '@/app/lib/calendarAdmin';
import { getAuthUser, requireRole } from '@/app/lib/auth';
import { logger } from '@/app/lib/logger';

export async function POST(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const roleErr = requireRole(user, ['superadmin']);
  if (roleErr) return NextResponse.json({ error: roleErr }, { status: 403 });

  try {
    const requestId = `frs-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const result = await fullResync(requestId);
    return NextResponse.json({ requestId: result.requestId, doctorsScanned: result.doctorsScanned });
  } catch (err) {
    logger.error('Full resync error', { error: String(err) });
    return NextResponse.json({ error: 'Full resync failed' }, { status: 500 });
  }
}
