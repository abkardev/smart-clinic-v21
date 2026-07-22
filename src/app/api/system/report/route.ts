export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { getAuthUser, requireRole } from '@/app/lib/auth';
import { logger } from '@/app/lib/logger';
import pkg from '../../../../../package.json';

const START_TIME = Date.now();
const COMMIT_SHA = process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA || process.env.VERCEL_GIT_COMMIT_SHA || null;
const DEPLOYED_AT = process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_AT ? new Date(process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_AT).toISOString() : null;
const ENVIRONMENT = process.env.NODE_ENV || 'development';

export async function GET(req: NextRequest) {
  try {
    const { user, error } = await getAuthUser(req);
    if (error) return error;
    const roleError = requireRole(user!, 'superadmin', 'admin');
    if (roleError) return roleError;

    const [dbVersion, migrationCount, bookingCount, doctorCount, userCount, pendingJobs, failedJobs, processingJobs] = await Promise.all([
      prisma.$queryRaw<Array<Record<string, unknown>>>`SELECT version()`.then(r => {
        const v = String(r[0]?.version ?? '');
        return v.split(',')[0] ?? v;
      }).catch(() => null),
      prisma.$queryRaw<Array<Record<string, unknown>>>`SELECT count(*) as count FROM _prisma_migrations`.then(r => Number(r[0]?.count ?? 0)).catch(() => null),
      prisma.booking.count(),
      prisma.doctor.count(),
      prisma.user.count(),
      prisma.calendarSyncJob.count({ where: { status: 'pending' } }),
      prisma.calendarSyncJob.count({ where: { status: 'failed' } }),
      prisma.calendarSyncJob.count({ where: { status: 'processing' } }),
    ]);

    const schedulerStatus = pendingJobs > 0 || processingJobs > 0 ? 'active' : 'idle';
    const retryHealthy = processingJobs === 0;

    return NextResponse.json({
      version: pkg.version,
      environment: ENVIRONMENT,
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor((Date.now() - START_TIME) / 1000),
      database: {
        version: dbVersion,
        migrationCount,
        tables: { bookings: bookingCount, doctors: doctorCount, users: userCount },
      },
      build: {
        commit: COMMIT_SHA,
        deployedAt: DEPLOYED_AT,
        nodeVersion: process.version,
        platform: `${process.platform} (${process.arch})`,
      },
      deployment: {
        target: process.env.VERCEL ? 'vercel' : 'self-hosted',
        region: process.env.VERCEL_REGION ?? null,
        url: process.env.NEXT_PUBLIC_APP_URL ?? null,
      },
      scheduler: {
        status: schedulerStatus,
        retryHealthy,
        pendingJobs,
        failedJobs,
        processingJobs,
        enabled: process.env.CALENDAR_RETRY_ENABLED === 'true',
      },
      healthSummary: {
        status: retryHealthy ? 'healthy' : 'degraded',
        checks: ['database', 'environment', 'scheduler'],
      },
    });
  } catch (err) {
    logger.error('System report error', { error: String(err) });
    return NextResponse.json({ message: 'Server error' }, { status: 500 });
  }
}
