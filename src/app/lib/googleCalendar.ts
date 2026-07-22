import { google } from './google';
import { prisma } from './prisma';
import { logger } from './logger';
import { logAudit, AuditAction, AuditOptions } from './audit';
import { metrics } from './metrics';
import type { Booking, Doctor } from '@prisma/client';

interface CalendarResult {
  calendarEventId: string;
  calendarLink: string;
}

export interface SyncBookingResult {
  action: 'created' | 'updated' | 'deleted' | 'recreated' | 'skipped' | 'failed';
  calendarEventId?: string;
  calendarLink?: string;
  error?: string;
}

export interface SyncBookingOptions {
  auditOpts?: AuditOptions;
  skipRetryEnqueue?: boolean;
}

function isTransientError(err: unknown): boolean {
  const gErr = err as { code?: number; status?: number };
  const code = gErr.code ?? gErr.status ?? 0;
  if (code === 0) return true;
  if (code === 429) return true;
  if (code >= 500 && code < 600) return true;
  return false;
}

async function enqueueRetry(
  bookingId: string,
  doctorId: string,
  auditOpts?: AuditOptions
): Promise<void> {
  try {
    const nextRetryAt = new Date(Date.now() + 60 * 1000);
    await prisma.calendarSyncJob.create({
      data: { bookingId, doctorId, attempt: 0, status: 'pending', nextRetryAt },
    });
    if (auditOpts) {
      logAudit(AuditAction.GOOGLE_SYNC_RETRY, 'Booking', bookingId,
        { doctorId, nextRetryAt: nextRetryAt.toISOString() }, auditOpts
      ).catch(() => {});
    }
  } catch (err) {
    logger.error('Failed to enqueue retry job', { bookingId, doctorId, error: String(err) });
  }
}

export function getNextRetryAt(attempt: number): Date {
  const delays = [1, 5, 15, 60, 1440];
  const delay = delays[attempt] ?? 1440;
  return new Date(Date.now() + delay * 60 * 1000);
}

function buildEventBody(booking: Booking, doctor: Doctor) {
  const startDT = new Date(`${booking.date}T${booking.time}:00`);
  const endDT = new Date(startDT.getTime() + doctor.slotDuration * 60000);
  return {
    summary: `${booking.name} — ${booking.service}`,
    description: `Phone: ${booking.phone}\nNotes: ${booking.notes ?? ''}`,
    start: { dateTime: startDT.toISOString(), timeZone: 'Asia/Riyadh' },
    end:   { dateTime: endDT.toISOString(), timeZone: 'Asia/Riyadh' },
  };
}

export function hasSignificantDrift(booking: Booking, googleEvent: Record<string, unknown>): string | null {
  const start = googleEvent.start as Record<string, string> | undefined;
  const end = googleEvent.end as Record<string, string> | undefined;
  if (!start?.dateTime || !end?.dateTime) return null;

  const gStart = new Date(start.dateTime);
  const gEnd = new Date(end.dateTime);
  const bStart = new Date(`${booking.date}T${booking.time}:00`);
  const bEnd = new Date(bStart.getTime() + 30 * 60000);

  const driftMs = Math.abs(gStart.getTime() - bStart.getTime());
  if (driftMs > 60000) {
    return `time_drift:${Math.round(driftMs / 60000)}m`;
  }

  const durMs = Math.abs((gEnd.getTime() - gStart.getTime()) - (bEnd.getTime() - bStart.getTime()));
  if (durMs > 60000) {
    return `duration_drift:${Math.round(durMs / 60000)}m`;
  }

  return null;
}

export async function fetchDoctorEvents(
  doctorId: string,
  calendarId: string,
  syncToken?: string | null,
): Promise<{ events: Record<string, unknown>[]; nextSyncToken?: string }> {
  try {
    const params: Record<string, unknown> = {
      calendarId,
      maxResults: 250,
    };

    if (syncToken) {
      params.syncToken = syncToken;
    } else {
      params.timeMin = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
      params.timeMax = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
    }

    const res = await google.events.list(params);
    const nextSyncToken = res.data.nextSyncToken ?? undefined;
    return { events: (res.data.items ?? []) as Record<string, unknown>[], nextSyncToken };
  } catch (err) {
    const gErr = err as { code?: number };
    if (gErr.code === 410) {
      logger.warn('Sync token invalid, will full resync', { doctorId });
      await prisma.calendarSyncState.update({
        where: { doctorId },
        data: { syncToken: null, fullSyncAt: new Date() },
      }).catch(() => {});
    }
    throw err;
  }
}

export async function importBusyTimes(
  doctorId: string,
  events: Record<string, unknown>[],
): Promise<number> {
  let imported = 0;

  for (const event of events) {
    const eventId = event.id as string;
    const status = event.status as string;
    const summary = (event.summary as string) ?? '';
    const start = event.start as Record<string, string> | undefined;
    const end = event.end as Record<string, string> | undefined;

    if (!eventId || !start?.dateTime || status === 'cancelled') continue;

    const startDate = new Date(start.dateTime);
    const endDate = end?.dateTime ? new Date(end.dateTime) : new Date(startDate.getTime() + 30 * 60000);
    const dateStr = startDate.toISOString().split('T')[0];
    const timeStr = `${String(startDate.getHours()).padStart(2, '0')}:${String(startDate.getMinutes()).padStart(2, '0')}`;

    const booking = await prisma.booking.findFirst({ where: { calendarEventId: eventId } });
    if (booking) continue;

    const existingBlocked = await prisma.blockedSlot.findFirst({
      where: { doctorId, date: dateStr, time: timeStr },
    });
    if (existingBlocked) continue;

    await prisma.blockedSlot.create({
      data: {
        doctorId,
        date: dateStr,
        time: timeStr,
        reason: summary || 'Imported from Google Calendar',
        isWholeDay: false,
        syncedToGoogle: true,
        googleEventId: eventId,
        blockingSource: 'google_import',
      },
    });
    imported++;
  }

  if (imported > 0) {
    logAudit('GOOGLE_BUSY_IMPORTED', 'Doctor', doctorId, { imported, source: 'watch_sync' });
  }

  return imported;
}

export async function detectConflicts(
  doctorId: string,
  events: Record<string, unknown>[],
): Promise<number> {
  let conflicts = 0;

  for (const event of events) {
    const eventId = event.id as string;
    if (!eventId) continue;

    const booking = await prisma.booking.findFirst({ where: { calendarEventId: eventId } });
    if (!booking) continue;

    const drift = hasSignificantDrift(booking, event);
    if (drift) {
      logAudit('GOOGLE_CONFLICT_DETECTED', 'Booking', booking.id, {
        drift,
        eventId,
        bookingDate: booking.date,
        bookingTime: booking.time,
      });
      conflicts++;
    }
  }

  return conflicts;
}

export async function createCalendarEvent(
  booking: Booking,
  doctor: Doctor
): Promise<CalendarResult | null> {
  const start = Date.now();
  const event = await google.events.insert({
    calendarId: doctor.calendarId,
    requestBody: buildEventBody(booking, doctor),
  });
  metrics.googleCalendarLatency.observe(Date.now() - start);

  return {
    calendarEventId: event.data.id ?? '',
    calendarLink: event.data.htmlLink ?? '',
  };
}

export async function updateCalendarEvent(
  booking: Booking,
  doctor: Doctor
): Promise<void> {
  if (!booking.calendarEventId) return;
  const start = Date.now();
  await google.events.update({
    calendarId: doctor.calendarId,
    eventId: booking.calendarEventId,
    requestBody: buildEventBody(booking, doctor),
  });
  metrics.googleCalendarLatency.observe(Date.now() - start);
}

export async function deleteCalendarEvent(
  calendarId: string,
  eventId: string
): Promise<void> {
  try {
    await google.events.delete({ calendarId, eventId });
  } catch (err) {
    if ((err as { code?: number }).code === 404) return;
    throw err;
  }
}

export async function syncBooking(
  booking: Booking,
  doctor: Doctor,
  options?: SyncBookingOptions
): Promise<SyncBookingResult> {
  const auditBase = (action: string, details: Record<string, unknown>) => {
    if (options?.auditOpts) {
      logAudit(action, 'Booking', booking.id, details, options.auditOpts).catch(() => {});
    }
  };

  // Incremental: skip if already synced and unchanged
  if (booking.calendarEventId && booking.calendarSynced && booking.calendarLastSyncedAt) {
    if (booking.updatedAt <= booking.calendarLastSyncedAt) {
      return { action: 'skipped' };
    }
  }

  // CASE 3: Cancelled booking with existing event → delete
  if (booking.status === 'cancelled' && booking.calendarEventId) {
    try {
      await deleteCalendarEvent(doctor.calendarId, booking.calendarEventId);
      await prisma.booking.update({
        where: { id: booking.id },
        data: { calendarEventId: null, calendarLink: null, calendarSynced: false, calendarLastSyncedAt: null },
      });
      auditBase(AuditAction.GOOGLE_EVENT_DELETED, { calendarEventId: booking.calendarEventId });
      return { action: 'deleted' };
    } catch (err) {
      if (isTransientError(err) && !options?.skipRetryEnqueue) {
        await enqueueRetry(booking.id, doctor.id, options?.auditOpts);
      }
      logger.warn('syncBooking: delete failed', { bookingId: booking.id, error: String(err) });
      return { action: 'failed', error: String(err) };
    }
  }

  // CASE 1: No event yet → create
  if (!booking.calendarEventId) {
    try {
      const calResult = await createCalendarEvent(booking, doctor);
      if (calResult) {
        await prisma.booking.update({
          where: { id: booking.id },
          data: { ...calResult, calendarSynced: true, calendarLastSyncedAt: new Date() },
        });
        auditBase(AuditAction.GOOGLE_EVENT_CREATED, { calendarEventId: calResult.calendarEventId });
        return { action: 'created', ...calResult };
      }
      return { action: 'failed', error: 'createCalendarEvent returned null' };
    } catch (err) {
      if (isTransientError(err) && !options?.skipRetryEnqueue) {
        await enqueueRetry(booking.id, doctor.id, options?.auditOpts);
      }
      logger.warn('syncBooking: create failed', { bookingId: booking.id, error: String(err) });
      return { action: 'failed', error: String(err) };
    }
  }

  // CASE 2/4: Has eventId → try update, recreate on 404
  try {
    await updateCalendarEvent(booking, doctor);
    await prisma.booking.update({
      where: { id: booking.id },
      data: { calendarSynced: true, calendarLastSyncedAt: new Date() },
    });
    auditBase(AuditAction.GOOGLE_EVENT_UPDATED, { calendarEventId: booking.calendarEventId });
    return { action: 'updated', calendarEventId: booking.calendarEventId ?? undefined };
  } catch (err) {
    const gErr = err as { code?: number; message?: string };
    if (gErr.code === 404) {
      // CASE 4: Google event missing → recreate
      try {
        const calResult = await createCalendarEvent(booking, doctor);
        if (calResult) {
          await prisma.booking.update({
            where: { id: booking.id },
            data: { ...calResult, calendarSynced: true, calendarLastSyncedAt: new Date() },
          });
          auditBase(AuditAction.GOOGLE_EVENT_RECREATED, {
            oldEventId: booking.calendarEventId,
            newEventId: calResult.calendarEventId,
          });
          return { action: 'recreated', ...calResult };
        }
        return { action: 'failed', error: 'createCalendarEvent returned null during recovery' };
      } catch (recreateErr) {
        if (isTransientError(recreateErr) && !options?.skipRetryEnqueue) {
          await enqueueRetry(booking.id, doctor.id, options?.auditOpts);
        }
        logger.warn('syncBooking: recreate failed', { bookingId: booking.id, error: String(recreateErr) });
        return { action: 'failed', error: String(recreateErr) };
      }
    }
    if (isTransientError(err) && !options?.skipRetryEnqueue) {
      await enqueueRetry(booking.id, doctor.id, options?.auditOpts);
    }
    logger.warn('syncBooking: update failed', { bookingId: booking.id, error: gErr.message ?? String(err) });
    return { action: 'failed', error: gErr.message ?? String(err) };
  }
}
