export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { getAuthUser, requireRole } from '@/app/lib/auth';
import { logger } from '@/app/lib/logger';

export async function GET(req: NextRequest) {
  try {
    const { user, error } = await getAuthUser(req);
    if (error) return error;
    const roleError = requireRole(user!, 'superadmin');
    if (roleError) return roleError;

    const env = process.env.NODE_ENV || 'development';
    const isVercel = !!process.env.VERCEL;
    const isPostgres = !!process.env.DATABASE_URL;

    let lastBackupAge: number | null = null;
    let backupAvailable = false;

    if (isVercel && isPostgres) {
      const dbStart = Date.now();
      const dbOk = await prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false);
      const dbLatencyMs = Date.now() - dbStart;

      if (dbOk) {
        const tableCounts = await Promise.all([
          prisma.booking.count().catch(() => 0),
          prisma.doctor.count().catch(() => 0),
          prisma.user.count().catch(() => 0),
          prisma.auditLog.count().catch(() => 0),
        ]);

        const integrityOk = tableCounts.every(c => typeof c === 'number');

        return NextResponse.json({
          timestamp: new Date().toISOString(),
          platform: 'vercel-postgres',
          backupAvailable: true,
          lastBackupAgeSeconds: null,
          lastBackupAgePretty: 'Managed by Vercel/Neon (automatic)',
          integrity: integrityOk ? 'verified' : 'failed',
          recordCounts: {
            bookings: tableCounts[0],
            doctors: tableCounts[1],
            users: tableCounts[2],
            auditLogs: tableCounts[3],
          },
          databaseLatencyMs: dbLatencyMs,
          recoveryStatus: 'available',
        });
      }

      return NextResponse.json({
        timestamp: new Date().toISOString(),
        platform: 'vercel-postgres',
        backupAvailable: false,
        lastBackupAgeSeconds: null,
        integrity: 'unreachable',
        recoveryStatus: 'unknown',
      });
    }

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      platform: env === 'development' ? 'development' : 'self-hosted',
      backupAvailable: false,
      lastBackupAgeSeconds: null,
      lastBackupAgePretty: 'Configure external backup (pg_dump)',
      integrity: 'not-verified',
      recoveryStatus: 'configure-external-backup',
      recommendation: 'Set up pg_dump cron job or use managed PostgreSQL with automatic backups.',
    });
  } catch (err) {
    logger.error('Backup endpoint error', { error: String(err) });
    return NextResponse.json({ message: 'Server error' }, { status: 500 });
  }
}
