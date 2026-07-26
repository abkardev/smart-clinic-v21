import { NextRequest, NextResponse } from 'next/server';
import { renewChannels } from '@/app/lib/googleChannels';
import { getAuthUser, requireRole } from '@/app/lib/auth';
import { logger } from '@/app/lib/logger';

export async function POST(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (auth.error) return auth.error;
  const roleError = requireRole(auth.user!, 'superadmin', 'admin');
  if (roleError) return roleError;

  try {
    const result = await renewChannels();
    return NextResponse.json(result);
  } catch (err) {
    logger.error('Channel renewal failed', { error: String(err) });
    return NextResponse.json({ error: 'Renewal failed' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const { error } = await getAuthUser(req);
  if (error) return error;

  try {
    const { getActiveChannels } = await import('@/app/lib/googleChannels');
    const count = await getActiveChannels();
    return NextResponse.json({ activeChannels: count });
  } catch (err) {
    logger.error('Get active channels failed', { error: String(err) });
    return NextResponse.json({ error: 'Failed to get channels' }, { status: 500 });
  }
}
