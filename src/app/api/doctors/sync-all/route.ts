export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { getAuthUser, requireRole } from '@/app/lib/auth';
import { logAudit, auditOptsFromRequest, AuditAction } from '@/app/lib/audit';
import { logger } from '@/app/lib/logger';

export async function POST(req: NextRequest) {
  const { user, error } = await getAuthUser(req);
  if (error) return error;
  const roleError = requireRole(user!, 'superadmin', 'admin');
  if (roleError) return roleError;

  const auditOpts = auditOptsFromRequest(req, user!);

  await logAudit(AuditAction.GOOGLE_SYNC_STARTED, 'System', null, {}, auditOpts);

  const doctors = await prisma.doctor.findMany({
    where: { isActive: true, calendarId: { not: '' } },
  });

  const { syncBooking } = await import('@/app/lib/googleCalendar');

  const syncOneDoctor = async (doctor: typeof doctors[number]) => {
    const bookings = await prisma.booking.findMany({
      where: {
        doctorId: doctor.id,
        OR: [
          { calendarEventId: null },
          { calendarSynced: false },
        ],
      },
    });

    const counts = { created: 0, updated: 0, deleted: 0, recreated: 0, failed: 0, skipped: 0 };

    for (const booking of bookings) {
      const result = await syncBooking(booking, doctor, { auditOpts });
      switch (result.action) {
        case 'created':  counts.created++;  break;
        case 'updated':  counts.updated++;  break;
        case 'deleted':  counts.deleted++;  break;
        case 'recreated': counts.recreated++; break;
        case 'failed':   counts.failed++;   break;
        case 'skipped':  counts.skipped++;  break;
      }
    }

    return { doctorId: doctor.id, doctor: doctor.nameEn, ...counts };
  };

  const settled = await Promise.allSettled(doctors.map(syncOneDoctor));

  const results: { doctorId: string; doctor: string; created: number; updated: number; deleted: number; recreated: number; failed: number; skipped: number }[] = [];
  let successful = 0;
  let failed = 0;

  for (const s of settled) {
    if (s.status === 'fulfilled') {
      results.push(s.value);
      successful++;
    } else {
      failed++;
      logger.error('sync-all doctor failed', { error: s.reason });
    }
  }

  const totals = results.reduce(
    (acc, r) => ({
      created: acc.created + r.created,
      updated: acc.updated + r.updated,
      deleted: acc.deleted + r.deleted,
      recreated: acc.recreated + r.recreated,
      failed: acc.failed + r.failed,
      skipped: acc.skipped + r.skipped,
    }),
    { created: 0, updated: 0, deleted: 0, recreated: 0, failed: 0, skipped: 0 },
  );

  await logAudit(AuditAction.GOOGLE_SYNC_COMPLETED, 'System', null,
    { totalDoctors: doctors.length, successful, doctorsFailed: failed, ...totals }, auditOpts
  );

  return NextResponse.json({
    message: 'Synchronization completed.',
    totalDoctors: doctors.length,
    successful,
    failed,
    results,
  });
}
