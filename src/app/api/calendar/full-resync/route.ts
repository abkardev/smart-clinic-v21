import { NextRequest, NextResponse } from 'next/server';
import { fullResync } from '@/app/lib/calendarAdmin';
import { getAuthUser, requireRole } from '@/app/lib/auth';
import { logger } from '@/app/lib/logger';

export async function POST(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (auth.error) return auth.error;

  const roleErr = requireRole(auth.user, 'superadmin');
  if (roleErr) return roleErr;

  try {
    const requestId = `frs-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const result = await fullResync(requestId);
    return NextResponse.json({ requestId: result.requestId, doctorsScanned: result.doctorsScanned });
  } catch (err) {
    logger.error('Full resync error', { error: String(err) });
    return NextResponse.json({ error: 'Full resync failed' }, { status: 500 });
  }
}
