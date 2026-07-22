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

  try {
    const body = await req.json() as { doctorId?: string };
    const doctorId = body.doctorId;
    if (!doctorId) {
      return NextResponse.json({ message: 'doctorId is required' }, { status: 400 });
    }

    const doctor = await prisma.doctor.findUnique({
      where: { id: doctorId },
    });
    if (!doctor) {
      return NextResponse.json({ message: 'Doctor not found' }, { status: 404 });
    }
    if (!doctor.calendarId) {
      return NextResponse.json({ message: 'Doctor has no Google Calendar configured' }, { status: 400 });
    }

    await logAudit(AuditAction.GOOGLE_SYNC_STARTED, 'Doctor', doctorId,
      {}, auditOpts
    );

    const bookings = await prisma.booking.findMany({
      where: {
        doctorId,
        OR: [
          { calendarEventId: null },
          { calendarSynced: false },
        ],
      },
    });

    const { syncBooking } = await import('@/app/lib/googleCalendar');
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

    await logAudit(AuditAction.GOOGLE_SYNC_COMPLETED, 'Doctor', doctorId,
      counts, auditOpts
    );

    return NextResponse.json({
      message: 'Synchronization completed.',
      ...counts,
    });
  } catch (err) {
    logger.error('sync-google failed', { error: String(err) });
    return NextResponse.json({ message: 'Server error' }, { status: 500 });
  }
}
