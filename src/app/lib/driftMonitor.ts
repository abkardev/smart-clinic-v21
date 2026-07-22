import { prisma } from './prisma';
import { logger } from './logger';
import { logAudit } from './audit';
import { google } from './google';

export interface DriftReport {
  doctorId: string;
  doctorName: string;
  totalBookings: number;
  syncedBookings: number;
  unsyncedBookings: number;
  googleEventCount: number;
  missingEvents: Array<{ bookingId: string; name: string; date: string; time: string; calendarEventId: string }>;
  orphanEvents: Array<{ eventId: string; summary: string; date: string; time: string }>;
  modifiedEvents: Array<{
    bookingId: string;
    name: string;
    date: string;
    time: string;
    driftType: string;
    details: string;
  }>;
  status: 'healthy' | 'degraded' | 'unhealthy';
}

export async function runDriftCheck(doctorId?: string): Promise<DriftReport[]> {
  const where = doctorId ? { id: doctorId } : {};
  const doctors = await prisma.doctor.findMany({ where });

  const reports: DriftReport[] = [];

  for (const doctor of doctors) {
    try {
      const report = await checkDoctorDrift(doctor);
      reports.push(report);
    } catch (err) {
      logger.error('Drift check failed for doctor', {
        doctorId: doctor.id,
        error: String(err),
      });
      reports.push({
        doctorId: doctor.id,
        doctorName: doctor.nameEn,
        totalBookings: 0,
        syncedBookings: 0,
        unsyncedBookings: 0,
        googleEventCount: 0,
        missingEvents: [],
        orphanEvents: [],
        modifiedEvents: [],
        status: 'unhealthy',
      });
    }
  }

  const unhealthy = reports.filter((r) => r.status === 'unhealthy').length;
  const degraded = reports.filter((r) => r.status === 'degraded').length;

  logger.info('Drift check completed', {
    totalDoctors: reports.length,
    healthy: reports.length - unhealthy - degraded,
    degraded,
    unhealthy,
  });

  return reports;
}

async function checkDoctorDrift(doctor: {
  id: string;
  nameEn: string;
  calendarId: string;
}): Promise<DriftReport> {
  const report: DriftReport = {
    doctorId: doctor.id,
    doctorName: doctor.nameEn,
    totalBookings: 0,
    syncedBookings: 0,
    unsyncedBookings: 0,
    googleEventCount: 0,
    missingEvents: [],
    orphanEvents: [],
    modifiedEvents: [],
    status: 'healthy',
  };

  const today = new Date().toISOString().split('T')[0];

  const bookings = await prisma.booking.findMany({
    where: {
      doctorId: doctor.id,
      date: { gte: today },
      status: { not: 'cancelled' },
    },
    orderBy: { date: 'asc' },
  });

  report.totalBookings = bookings.length;
  report.syncedBookings = bookings.filter((b) => b.calendarEventId && b.calendarSynced).length;
  report.unsyncedBookings = bookings.filter((b) => !b.calendarEventId || !b.calendarSynced).length;

  let googleEvents: Record<string, unknown>[] = [];
  try {
    const res = await google.events.list({
      calendarId: doctor.calendarId,
      timeMin: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      timeMax: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      maxResults: 2500,
    });
    googleEvents = (res.data.items ?? []) as Record<string, unknown>[];
  } catch (err) {
    logger.warn('Drift check: failed to fetch Google events', {
      doctorId: doctor.id,
      error: String(err),
    });
    report.status = 'degraded';
    return report;
  }

  report.googleEventCount = googleEvents.length;

  const googleEventMap = new Map<string, Record<string, unknown>>();
  for (const event of googleEvents) {
    const eventId = event.id as string;
    if (eventId) googleEventMap.set(eventId, event);
  }

  for (const booking of bookings) {
    if (!booking.calendarEventId) continue;

    const googleEvent = googleEventMap.get(booking.calendarEventId);
    if (!googleEvent) {
      report.missingEvents.push({
        bookingId: booking.id,
        name: booking.name,
        date: booking.date,
        time: booking.time,
        calendarEventId: booking.calendarEventId,
      });
      continue;
    }

    const start = googleEvent.start as Record<string, string> | undefined;
    const end = googleEvent.end as Record<string, string> | undefined;
    if (!start?.dateTime) continue;

    const gStart = new Date(start.dateTime);
    const gEnd = end?.dateTime ? new Date(end.dateTime) : new Date(gStart.getTime() + 30 * 60000);
    const bStart = new Date(`${booking.date}T${booking.time}:00`);

    const timeDrift = Math.abs(gStart.getTime() - bStart.getTime());
    if (timeDrift > 60000) {
      report.modifiedEvents.push({
        bookingId: booking.id,
        name: booking.name,
        date: booking.date,
        time: booking.time,
        driftType: 'time_drift',
        details: `Booking: ${booking.date}T${booking.time}, Google: ${start.dateTime}, drift: ${Math.round(timeDrift / 60000)}m`,
      });
    }
  }

  const bookingEventIds = new Set(bookings.filter((b) => b.calendarEventId).map((b) => b.calendarEventId));

  for (const event of googleEvents) {
    const eventId = event.id as string;
    if (!eventId) continue;
    if (bookingEventIds.has(eventId)) continue;

    const blocked = await prisma.blockedSlot.findFirst({ where: { googleEventId: eventId } });
    if (blocked) continue;

    const status = event.status as string;
    if (status === 'cancelled') continue;

    const summary = (event.summary as string) ?? '(no title)';
    const start = event.start as Record<string, string> | undefined;
    if (!start?.dateTime) continue;

    report.orphanEvents.push({
      eventId,
      summary,
      date: new Date(start.dateTime).toISOString().split('T')[0],
      time: new Date(start.dateTime).toTimeString().slice(0, 5),
    });
  }

  const totalIssues = report.missingEvents.length + report.orphanEvents.length + report.modifiedEvents.length;
  const bookingRatio = report.totalBookings > 0 ? report.syncedBookings / report.totalBookings : 1;

  if (totalIssues > 50) report.status = 'unhealthy';
  else if (totalIssues > 10 || bookingRatio < 0.8) report.status = 'degraded';

  if (totalIssues > 0) {
    logAudit('DRIFT_DETECTED', 'Doctor', doctor.id, {
      missingEvents: report.missingEvents.length,
      orphanEvents: report.orphanEvents.length,
      modifiedEvents: report.modifiedEvents.length,
      syncRatio: bookingRatio,
      status: report.status,
    });
  }

  return report;
}

export async function generateReconciliationReport(doctorId?: string): Promise<{
  timestamp: string;
  doctorsScanned: number;
  healthy: number;
  degraded: number;
  unhealthy: number;
  totalMissing: number;
  totalOrphan: number;
  totalModified: number;
  details: DriftReport[];
}> {
  const reports = await runDriftCheck(doctorId);

  return {
    timestamp: new Date().toISOString(),
    doctorsScanned: reports.length,
    healthy: reports.filter((r) => r.status === 'healthy').length,
    degraded: reports.filter((r) => r.status === 'degraded').length,
    unhealthy: reports.filter((r) => r.status === 'unhealthy').length,
    totalMissing: reports.reduce((s, r) => s + r.missingEvents.length, 0),
    totalOrphan: reports.reduce((s, r) => s + r.orphanEvents.length, 0),
    totalModified: reports.reduce((s, r) => s + r.modifiedEvents.length, 0),
    details: reports,
  };
}
