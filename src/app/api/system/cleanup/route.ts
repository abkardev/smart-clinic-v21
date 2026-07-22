export const dynamic = 'force-dynamic';
export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, requireRole } from '@/app/lib/auth';
import { logger } from '@/app/lib/logger';
import { runCleanup } from '@/app/lib/cleanup';

export async function POST(req: NextRequest) {
  try {
    const { user, error } = await getAuthUser(req);
    if (error) return error;
    const roleError = requireRole(user!, 'superadmin', 'admin');
    if (roleError) return roleError;

    const results = await runCleanup();

    return NextResponse.json({ success: true, ...results });
  } catch (err) {
    logger.error('Cleanup endpoint error', { error: String(err) });
    return NextResponse.json({ message: 'Server error' }, { status: 500 });
  }
}
