import { NextRequest, NextResponse } from 'next/server';
import { runDiagnostics } from '@/app/lib/calendarAdmin';
import { getAuthUser, requireRole } from '@/app/lib/auth';
import { logger } from '@/app/lib/logger';

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const roleErr = requireRole(user, ['superadmin', 'admin']);
  if (roleErr) return NextResponse.json({ error: roleErr }, { status: 403 });

  try {
    const result = await runDiagnostics();
    return NextResponse.json(result);
  } catch (err) {
    logger.error('Calendar diagnostics error', { error: String(err) });
    return NextResponse.json({ error: 'Diagnostics failed' }, { status: 500 });
  }
}
