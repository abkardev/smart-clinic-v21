import { NextRequest, NextResponse } from 'next/server';
import { runDiagnostics } from '@/app/lib/calendarAdmin';
import { getAuthUser, requireRole } from '@/app/lib/auth';
import { logger } from '@/app/lib/logger';

export async function GET(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (auth.error) return auth.error;

  const roleErr = requireRole(auth.user, 'superadmin', 'admin');
  if (roleErr) return roleErr;

  try {
    const result = await runDiagnostics();
    return NextResponse.json(result);
  } catch (err) {
    logger.error('Calendar diagnostics error', { error: String(err) });
    return NextResponse.json({ error: 'Diagnostics failed' }, { status: 500 });
  }
}
