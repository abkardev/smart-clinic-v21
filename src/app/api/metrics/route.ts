export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, requireRole } from '@/app/lib/auth';
import { metrics, getUptimeSeconds } from '@/app/lib/metrics';
import pkg from '../../../../package.json';

export async function GET(req: NextRequest) {
  const { user, error } = await getAuthUser(req);
  if (error) return error;
  const roleError = requireRole(user!, 'superadmin', 'admin');
  if (roleError) return roleError;

  const snapshot = metrics.snapshot();

  const response = {
    timestamp: new Date().toISOString(),
    uptimeSeconds: getUptimeSeconds(),
    version: pkg.version,
    metrics: snapshot,
  };

  return NextResponse.json(response);
}
