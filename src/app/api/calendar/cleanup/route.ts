import { NextRequest, NextResponse } from 'next/server';
import { cleanup } from '@/app/lib/calendarAdmin';
import { getAuthUser, requireRole } from '@/app/lib/auth';
import { logAudit } from '@/app/lib/audit';
import { logger } from '@/app/lib/logger';

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const roleErr = requireRole(user, ['superadmin', 'admin']);
  if (roleErr) return NextResponse.json({ error: roleErr }, { status: 403 });

  try {
    const type = req.nextUrl.searchParams.get('type') ?? 'all';
    const dryRun = req.nextUrl.searchParams.get('dryRun') !== 'false';

    const requestId = `cln-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const result = await cleanup(type, dryRun, requestId);

    logAudit('CONFIG_UPDATED', 'System', 'cleanup', { type, dryRun, requestId, result: JSON.stringify(result) }).catch(() => {});

    return NextResponse.json(result);
  } catch (err) {
    logger.error('Cleanup error', { error: String(err) });
    const msg = (err as Error).message;
    return NextResponse.json({ error: msg }, { status: msg.includes('Unknown') ? 400 : 500 });
  }
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const roleErr = requireRole(user, ['superadmin']);
  if (roleErr) return NextResponse.json({ error: roleErr }, { status: 403 });

  try {
    const body = await req.json();
    const type = body.type ?? 'all';
    const dryRun = body.dryRun !== false;

    const requestId = `cln-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const result = await cleanup(type, dryRun, requestId);

    logAudit('CONFIG_UPDATED', 'System', 'cleanup', { type, dryRun, requestId }).catch(() => {});

    return NextResponse.json(result);
  } catch (err) {
    logger.error('Cleanup error', { error: String(err) });
    const msg = (err as Error).message;
    return NextResponse.json({ error: msg }, { status: msg.includes('Unknown') ? 400 : 500 });
  }
}
