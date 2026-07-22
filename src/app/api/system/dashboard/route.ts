export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { getAuthUser, requireRole } from '@/app/lib/auth';
import { logger } from '@/app/lib/logger';

export async function GET(req: NextRequest) {
  try {
    const { user, error } = await getAuthUser(req);
    if (error) return error;
    const roleError = requireRole(user!, 'superadmin', 'admin');
    if (roleError) return roleError;

    const today = new Date().toISOString().split('T')[0];
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    const dbStart = Date.now();
    const dbHealthy = await prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false);
    const dbLatencyMs = Date.now() - dbStart;

    const [
      totalBookings,
      todayBookings,
      activeDoctors,
      failedJobs,
      pendingJobs,
      failedRetryJobs,
      lastWorkerRun,
      totalJobs,
      errorsLastHour,
      avgApiLatency,
    ] = await Promise.all([
      prisma.booking.count(),
      prisma.booking.count({ where: { date: today } }),
      prisma.doctor.count({ where: { isActive: true } }),
      prisma.calendarSyncJob.count({ where: { status: 'failed' } }),
      prisma.calendarSyncJob.count({ where: { status: 'pending' } }),
      prisma.calendarSyncJob.count({ where: { status: 'failed' } }),
      prisma.auditLog.findFirst({
        where: { action: 'RETRY_WORKER_COMPLETED', status: 'success' },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
      prisma.calendarSyncJob.count(),
      prisma.auditLog.count({
        where: { severity: 'ERROR', createdAt: { gte: oneHourAgo } },
      }),
      Promise.resolve(null) as Promise<number | null>,
    ]);

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      dbLatencyMs,
      dbHealthy,
      bookings: { total: totalBookings, today: todayBookings },
      doctors: { active: activeDoctors },
      retryQueue: {
        failed: failedJobs,
        pending: pendingJobs,
        total: totalJobs,
        lastSuccessfulRun: lastWorkerRun?.createdAt.toISOString() ?? null,
      },
      schedulerStatus: pendingJobs > 0 ? 'active' : 'idle',
      errorRate: { lastHour: errorsLastHour },
      avgApiResponseTimeMs: avgApiLatency,
    });
  } catch (err) {
    logger.error('Dashboard endpoint error', { error: String(err) });
    return NextResponse.json({ message: 'Server error' }, { status: 500 });
  }
}
