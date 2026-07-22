import { NextRequest, NextResponse } from 'next/server';
import { getConfig, updateConfig } from '@/app/lib/calendarAdmin';
import { getAuthUser, requireRole } from '@/app/lib/auth';
import { logAudit } from '@/app/lib/audit';
import { logger } from '@/app/lib/logger';

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const roleErr = requireRole(user, ['superadmin', 'admin']);
  if (roleErr) return NextResponse.json({ error: roleErr }, { status: 403 });

  try {
    const config = await getConfig();
    return NextResponse.json(config);
  } catch (err) {
    logger.error('Config get error', { error: String(err) });
    return NextResponse.json({ error: 'Failed to get config' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const roleErr = requireRole(user, ['superadmin']);
  if (roleErr) return NextResponse.json({ error: roleErr }, { status: 403 });

  try {
    const body = await req.json();
    const allowedKeys = [
      'retryAttempts', 'retryIntervals', 'quotaLimit', 'quotaRps', 'quotaBurst',
      'renewThreshold', 'webhookTimeout', 'batchSize', 'renewalWindowHours',
    ];

    for (const key of Object.keys(body)) {
      if (!allowedKeys.includes(key)) {
        return NextResponse.json({ error: `Unknown config key: ${key}` }, { status: 400 });
      }
    }

    const config = await updateConfig(body);

    logAudit('CONFIG_UPDATED', 'System', 'calendar', { changes: body }).catch(() => {});

    return NextResponse.json({ success: true, config });
  } catch (err) {
    logger.error('Config update error', { error: String(err) });
    return NextResponse.json({ error: 'Failed to update config' }, { status: 500 });
  }
}
