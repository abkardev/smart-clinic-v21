import { prisma } from './prisma';
import { logger } from './logger';
import { logAudit } from './audit';
import { metrics } from './metrics';
import { google } from './google';
import { getQuotaUsage } from './quotaManager';
import { getChannelHealth } from './channelScheduler';
import { getTokenHealth, getDoctorOAuthStatus, refreshDoctorToken } from './oauthLifecycle';
import { generateReconciliationReport } from './driftMonitor';
import { getDedupStats } from './notificationDedup';
import { syncBooking, fetchDoctorEvents, hasSignificantDrift } from './googleCalendar';
import type { Booking, Doctor } from '@prisma/client';

function correlationId(): string {
  return `cal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function getCalendarStatus() {
  const [channelHealth, tokenHealth, quota, dedup, syncStateCount, retryStats, driftReport] = await Promise.all([
    getChannelHealth(),
    getTokenHealth(),
    Promise.resolve(getQuotaUsage()),
    getDedupStats(),
    prisma.calendarSyncState.count(),
    getRetryStats(),
    generateReconciliationReport().catch(() => null),
  ]);

  const doctors = await prisma.doctor.findMany({
    select: { id: true, nameEn: true, calendarId: true },
  });

  const oauthStatuses = await Promise.all(
    doctors.map(async (d) => {
      const status = await getDoctorOAuthStatus(d.id);
      return { doctorId: d.id, name: d.nameEn, calendarId: d.calendarId, oauth: status };
    }),
  );

  return {
    channels: channelHealth,
    tokens: tokenHealth,
    quota,
    dedup,
    syncStateCount,
    retry: retryStats,
    drift: driftReport
      ? {
          doctorsScanned: driftReport.doctorsScanned,
          healthy: driftReport.healthy,
          degraded: driftReport.degraded,
          unhealthy: driftReport.unhealthy,
          totalMissing: driftReport.totalMissing,
          totalOrphan: driftReport.totalOrphan,
          totalModified: driftReport.totalModified,
        }
      : null,
    doctors: oauthStatuses,
  };
}

async function getRetryStats() {
  const [pending, failed, processing, oldest] = await Promise.all([
    prisma.calendarSyncJob.count({ where: { status: 'pending' } }),
    prisma.calendarSyncJob.count({ where: { status: 'failed' } }),
    prisma.calendarSyncJob.count({ where: { status: 'processing' } }),
    prisma.calendarSyncJob.findFirst({
      where: { status: 'pending' },
      orderBy: { nextRetryAt: 'asc' },
      select: { nextRetryAt: true },
    }),
  ]);
  return { pending, failed, processing, oldestRetryAt: oldest?.nextRetryAt ?? null };
}

export async function getCalendarStatistics() {
  const today = new Date().toISOString().split('T')[0];
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
  const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];

  const audits = await prisma.auditLog.findMany({
    where: {
      action: {
        in: [
          'GOOGLE_EVENT_CREATED', 'GOOGLE_EVENT_UPDATED', 'GOOGLE_EVENT_DELETED',
          'GOOGLE_EVENT_RECREATED', 'GOOGLE_SYNC_RETRY', 'GOOGLE_SYNC_FAILED',
          'GOOGLE_CONFLICT_DETECTED',
        ],
      },
      createdAt: { gte: new Date(monthAgo) },
    },
    select: { action: true, createdAt: true },
  });

  const groupStats = (startDate: string) => {
    const filtered = audits.filter((a) => a.createdAt >= new Date(startDate));
    return {
      created: filtered.filter((a) => a.action === 'GOOGLE_EVENT_CREATED').length,
      updated: filtered.filter((a) => a.action === 'GOOGLE_EVENT_UPDATED').length,
      deleted: filtered.filter((a) => a.action === 'GOOGLE_EVENT_DELETED').length,
      recreated: filtered.filter((a) => a.action === 'GOOGLE_EVENT_RECREATED').length,
      failed: filtered.filter((a) => a.action === 'GOOGLE_SYNC_FAILED').length,
      skipped: 0,
      retries: filtered.filter((a) => a.action === 'GOOGLE_SYNC_RETRY').length,
      conflicts: filtered.filter((a) => a.action === 'GOOGLE_CONFLICT_DETECTED').length,
    };
  };

  const syncedBookings = await prisma.booking.count({ where: { calendarSynced: true } });

  return {
    totalSyncedBookings: syncedBookings,
    today: { label: 'today', date: today, ...groupStats(today) },
    week: { label: 'week', date: weekAgo, ...groupStats(weekAgo) },
    month: { label: 'month', date: monthAgo, ...groupStats(monthAgo) },
  };
}

export async function getCalendarActivity(limit = 100, cursor?: string) {
  const where = cursor ? { id: { lt: cursor } } : {};
  const audits = await prisma.auditLog.findMany({
    where: {
      ...where,
      action: {
        startsWith: 'GOOGLE_',
      },
    },
    orderBy: { createdAt: 'desc' },
    take: limit + 1,
    select: {
      id: true,
      action: true,
      entityType: true,
      entityId: true,
      details: true,
      createdAt: true,
    },
  });

  const hasMore = audits.length > limit;
  const items = hasMore ? audits.slice(0, limit) : audits;
  const nextCursor = items.length > 0 ? items[items.length - 1].id : null;

  return {
    items: items.map((a) => ({
      id: a.id,
      time: a.createdAt,
      action: a.action,
      entityType: a.entityType,
      entityId: a.entityId,
      details: a.details as Record<string, unknown> | null,
    })),
    pagination: { hasMore, nextCursor, limit },
  };
}

export async function resyncBooking(bookingId: string, requestId: string) {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking) throw new NotFoundError('Booking not found');

  const doctor = await prisma.doctor.findUnique({ where: { id: booking.doctorId } });
  if (!doctor) throw new NotFoundError('Doctor not found');

  logAudit('GOOGLE_SYNC_RETRY', 'Booking', bookingId, { requestId, reason: 'manual_resync' });

  const result = await syncBooking(booking, doctor, { skipRetryEnqueue: true });

  metrics.retryAttempts.inc();

  return { requestId, bookingId, action: result.action, calendarEventId: result.calendarEventId, error: result.error };
}

export async function resyncDoctor(doctorId: string, requestId: string) {
  const doctor = await prisma.doctor.findUnique({ where: { id: doctorId } });
  if (!doctor) throw new NotFoundError('Doctor not found');

  const bookings = await prisma.booking.findMany({
    where: { doctorId, status: { not: 'cancelled' } },
    orderBy: { date: 'asc' },
  });

  const results: Array<{ bookingId: string; action: string; error?: string }> = [];

  for (const booking of bookings) {
    try {
      const r = await syncBooking(booking, doctor, { skipRetryEnqueue: true });
      results.push({ bookingId: booking.id, action: r.action, error: r.error });
    } catch (err) {
      results.push({ bookingId: booking.id, action: 'failed', error: String(err) });
    }
  }

  logAudit('GOOGLE_SYNC_RETRY', 'Doctor', doctorId, { requestId, bookingsResynced: results.length });
  return { requestId, doctorId, total: results.length, results };
}

export async function fullResync(requestId: string) {
  const doctors = await prisma.doctor.findMany({ where: { isActive: true } });
  const allResults: Array<{ doctorId: string; total: number; failed: number }> = [];

  for (const doctor of doctors) {
    const bookings = await prisma.booking.findMany({
      where: { doctorId, calendarEventId: { not: null }, status: { not: 'cancelled' } },
    });

    let failed = 0;
    for (const booking of bookings) {
      try {
        await syncBooking(booking, doctor, { skipRetryEnqueue: true });
      } catch {
        failed++;
      }
    }
    allResults.push({ doctorId: doctor.id, total: bookings.length, failed });
  }

  logAudit('GOOGLE_SYNC_RETRY', 'System', 'full', { requestId, doctorsScanned: doctors.length });
  return { requestId, doctorsScanned: doctors.length, details: allResults };
}

export async function recreateEvent(bookingId: string, requestId: string) {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking) throw new NotFoundError('Booking not found');

  const doctor = await prisma.doctor.findUnique({ where: { id: booking.doctorId } });
  if (!doctor) throw new NotFoundError('Doctor not found');

  const oldEventId = booking.calendarEventId;

  if (oldEventId) {
    await prisma.booking.update({
      where: { id: booking.id },
      data: { calendarEventId: null, calendarLink: null, calendarSynced: false },
    });
  }

  const result = await syncBooking({ ...booking, calendarEventId: null, calendarSynced: false, calendarLink: null }, doctor, { skipRetryEnqueue: true });

  logAudit('GOOGLE_EVENT_RECREATED', 'Booking', bookingId, { requestId, oldEventId, newEventId: result.calendarEventId });
  return { requestId, bookingId, oldEventId, newEventId: result.calendarEventId, action: result.action, error: result.error };
}

export async function verifyBooking(bookingId: string, requestId: string) {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking) throw new NotFoundError('Booking not found');

  const doctor = await prisma.doctor.findUnique({ where: { id: booking.doctorId } });
  if (!doctor) throw new NotFoundError('Doctor not found');

  const checks: Record<string, unknown> = {
    bookingExists: true,
    doctorExists: true,
    hasCalendarEventId: !!booking.calendarEventId,
    isCalendarSynced: booking.calendarSynced,
    lastSyncedAt: booking.calendarLastSyncedAt,
  };

  if (booking.calendarEventId) {
    try {
      const res = await google.events.get({
        calendarId: doctor.calendarId,
        eventId: booking.calendarEventId,
      });
      checks.googleEventExists = true;
      checks.googleEventStatus = (res.data as Record<string, unknown>).status;

      const drift = hasSignificantDrift(booking, res.data as Record<string, unknown>);
      checks.drift = drift ?? 'none';
    } catch (err) {
      checks.googleEventExists = false;
      checks.googleError = String(err);
    }
  } else {
    checks.googleEventExists = null;
  }

  const dbMatches = booking.doctorId === doctor.id;
  checks.doctorMatch = dbMatches;

  logAudit('GOOGLE_SYNC_RETRY', 'Booking', bookingId, { requestId, action: 'verify', result: checks });
  return { requestId, bookingId, checks };
}

export async function searchCalendarEvents(params: {
  doctorId?: string;
  date?: string;
  status?: string;
  query?: string;
  bookingId?: string;
  googleEventId?: string;
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}) {
  const { doctorId, date, status, query, bookingId, googleEventId, page = 1, pageSize = 50, sortBy = 'date', sortOrder = 'desc' } = params;

  const where: Record<string, unknown> = {};

  if (doctorId) where.doctorId = doctorId;
  if (date) where.date = date;
  if (status) where.status = status;
  if (bookingId) where.id = bookingId;
  if (googleEventId) where.calendarEventId = googleEventId;
  if (query) {
    where.OR = [
      { name: { contains: query, mode: 'insensitive' } },
      { phone: { contains: query } },
      { service: { contains: query, mode: 'insensitive' } },
    ];
  }

  const skip = (page - 1) * pageSize;
  const orderBy: Record<string, string> = {};
  orderBy[sortBy] = sortOrder;

  const [items, total] = await Promise.all([
    prisma.booking.findMany({
      where: where as never,
      include: { doctor: { select: { id: true, nameEn: true, nameAr: true, calendarId: true } } },
      orderBy: orderBy as never,
      skip,
      take: pageSize,
    }),
    prisma.booking.count({ where: where as never }),
  ]);

  return {
    items: items.map((b) => ({
      id: b.id,
      name: b.name,
      phone: b.phone,
      service: b.service,
      date: b.date,
      time: b.time,
      status: b.status,
      doctorId: b.doctorId,
      doctorName: b.doctor.nameEn,
      calendarEventId: b.calendarEventId,
      calendarLink: b.calendarLink,
      calendarSynced: b.calendarSynced,
      calendarLastSyncedAt: b.calendarLastSyncedAt,
    })),
    pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
  };
}

export async function getConflicts(params: { doctorId?: string; type?: string; page?: number; pageSize?: number }) {
  const { doctorId, type, page = 1, pageSize = 50 } = params;
  const skip = (page - 1) * pageSize;

  const today = new Date().toISOString().split('T')[0];
  const conflicts: Array<{
    type: string;
    severity: string;
    bookingId?: string;
    doctorId?: string;
    doctorName?: string;
    date?: string;
    time?: string;
    description: string;
  }> = [];

  if (!type || type === 'missing_event') {
    const missing = await prisma.booking.findMany({
      where: {
        ...(doctorId ? { doctorId } : {}),
        calendarEventId: { not: null },
        calendarSynced: true,
        date: { gte: today },
        status: { not: 'cancelled' },
      },
      include: { doctor: { select: { nameEn: true } } },
      take: pageSize,
      skip,
    });

    for (const b of missing) {
      const doctor = await prisma.doctor.findUnique({ where: { id: b.doctorId } });
      if (!doctor) continue;
      try {
        await google.events.get({ calendarId: doctor.calendarId, eventId: b.calendarEventId! });
      } catch {
        conflicts.push({
          type: 'missing_event',
          severity: 'high',
          bookingId: b.id,
          doctorId: b.doctorId,
          doctorName: b.doctor.nameEn,
          date: b.date,
          time: b.time,
          description: `Booking ${b.id} has calendarEventId ${b.calendarEventId} but event not found in Google Calendar`,
        });
      }
    }
  }

  if (!type || type === 'time_overlap') {
    const allBookings = await prisma.booking.findMany({
      where: {
        ...(doctorId ? { doctorId } : {}),
        date: { gte: today },
        status: { not: 'cancelled' },
      },
      orderBy: [{ date: 'asc' }, { time: 'asc' }],
      include: { doctor: { select: { nameEn: true } } },
    });

    for (let i = 0; i < allBookings.length; i++) {
      for (let j = i + 1; j < allBookings.length; j++) {
        if (allBookings[i].doctorId !== allBookings[j].doctorId) continue;
        if (allBookings[i].date !== allBookings[j].date) continue;
        if (allBookings[i].time === allBookings[j].time) {
          conflicts.push({
            type: 'time_overlap',
            severity: 'high',
            bookingId: allBookings[i].id,
            doctorId: allBookings[i].doctorId,
            doctorName: allBookings[i].doctor.nameEn,
            date: allBookings[i].date,
            time: allBookings[i].time,
            description: `Double booking: ${allBookings[i].id} and ${allBookings[j].id} at same time`,
          });
        }
      }
    }
  }

  if (!type || type === 'token_expired') {
    const health = await getTokenHealth();
    if (health.expired > 0 || health.revoked > 0) {
      const tokens = await prisma.doctorCalendarToken.findMany({
        where: { status: { in: ['active', 'revoked'] }, tokenExpiresAt: { lte: new Date() } },
      });
      for (const t of tokens) {
        const doctor = await prisma.doctor.findUnique({ where: { id: t.doctorId } });
        conflicts.push({
          type: 'token_expired',
          severity: 'high',
          doctorId: t.doctorId,
          doctorName: doctor?.nameEn ?? 'Unknown',
          description: `OAuth token for doctor ${t.doctorId} is ${t.status}, expired at ${t.tokenExpiresAt?.toISOString()}`,
        });
      }
    }
  }

  if (!type || type === 'channel_expired') {
    const health = await getChannelHealth();
    if (health.expired > 0) {
      const channels = await prisma.calendarChannel.findMany({
        where: { expiration: { lte: new Date() } },
      });
      for (const ch of channels) {
        const doctor = await prisma.doctor.findUnique({ where: { id: ch.doctorId } });
        conflicts.push({
          type: 'channel_expired',
          severity: 'medium',
          doctorId: ch.doctorId,
          doctorName: doctor?.nameEn ?? 'Unknown',
          description: `Watch channel ${ch.channelId} expired at ${ch.expiration.toISOString()}`,
        });
      }
    }
  }

  return {
    items: conflicts.slice(0, pageSize),
    pagination: { page, pageSize, total: conflicts.length, totalPages: Math.ceil(conflicts.length / pageSize) },
  };
}

export async function runDiagnostics() {
  const checks: Array<{ name: string; status: string; details?: string }> = [];

  const channels = await getChannelHealth();
  checks.push({ name: 'push_channels', status: channels.active > 0 ? 'pass' : 'warn', details: `${channels.active} active, ${channels.expiring} expiring, ${channels.expired} expired` });

  const tokens = await getTokenHealth();
  checks.push({ name: 'oauth_tokens', status: tokens.expired === 0 ? 'pass' : tokens.expired > 3 ? 'fail' : 'warn', details: `${tokens.active} active, ${tokens.expired} expired, ${tokens.revoked} revoked` });

  const quota = getQuotaUsage();
  checks.push({ name: 'google_quota', status: quota.quotaExceeded ? 'fail' : quota.usagePercent > 80 ? 'warn' : 'pass', details: `${quota.dailyRequests}/${quota.dailyLimit} (${quota.usagePercent}%)` });

  const retry = await getRetryStats();
  checks.push({ name: 'retry_queue', status: retry.failed > 50 ? 'fail' : retry.pending > 0 ? 'warn' : 'pass', details: `${retry.pending} pending, ${retry.failed} failed, ${retry.processing} processing` });

  const webhookLast = await prisma.auditLog.findFirst({
    where: { action: 'GOOGLE_WEBHOOK_RECEIVED' },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  });
  const webhookAge = webhookLast ? Math.round((Date.now() - webhookLast.createdAt.getTime()) / 60000) : null;
  checks.push({ name: 'webhook_recent', status: webhookAge === null ? 'warn' : webhookAge > 1440 ? 'fail' : 'pass', details: webhookAge !== null ? `Last notification ${webhookAge} min ago` : 'No notifications ever' });

  const drift = await generateReconciliationReport().catch(() => null);
  checks.push({ name: 'drift_status', status: drift && drift.unhealthy === 0 ? 'pass' : drift && drift.unhealthy > 0 ? 'fail' : 'warn', details: drift ? `${drift.healthy} healthy, ${drift.degraded} degraded, ${drift.unhealthy} unhealthy` : 'Could not run' });

  const syncTokenCount = await prisma.calendarSyncState.count();
  const syncTokensActive = await prisma.calendarSyncState.count({ where: { syncToken: { not: null } } });
  checks.push({ name: 'sync_tokens', status: syncTokensActive > 0 ? 'pass' : 'warn', details: `${syncTokensActive}/${syncTokenCount} doctors have active sync tokens` });

  const credentialCheck = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  checks.push({ name: 'google_credentials', status: credentialCheck ? 'pass' : 'fail', details: credentialCheck ? 'Configured' : 'Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET' });

  const passCount = checks.filter((c) => c.status === 'pass').length;
  const warnCount = checks.filter((c) => c.status === 'warn').length;
  const failCount = checks.filter((c) => c.status === 'fail').length;
  const total = checks.length;

  const score = total > 0 ? Math.round((passCount / total) * 100) : 0;

  return {
    timestamp: new Date().toISOString(),
    score,
    status: failCount > 0 ? 'unhealthy' : warnCount > 3 ? 'degraded' : 'healthy',
    summary: { pass: passCount, warn: warnCount, fail: failCount, total },
    checks,
  };
}

export async function exportData(type: string, format: string) {
  let data: Record<string, unknown>[] = [];

  switch (type) {
    case 'sync': {
      const audits = await prisma.auditLog.findMany({
        where: { action: { in: ['GOOGLE_EVENT_CREATED', 'GOOGLE_EVENT_UPDATED', 'GOOGLE_EVENT_DELETED', 'GOOGLE_EVENT_RECREATED'] } },
        orderBy: { createdAt: 'desc' },
        take: 10000,
      });
      data = audits.map((a) => ({
        time: a.createdAt.toISOString(),
        action: a.action,
        entityType: a.entityType,
        entityId: a.entityId,
        details: JSON.stringify(a.details),
      }));
      break;
    }
    case 'conflict': {
      const conflicts = await getConflicts({ pageSize: 10000 });
      data = conflicts.items.map((c) => ({
        type: c.type,
        severity: c.severity,
        doctorId: c.doctorId ?? '',
        doctorName: c.doctorName ?? '',
        date: c.date ?? '',
        time: c.time ?? '',
        description: c.description,
      }));
      break;
    }
    case 'retry': {
      const jobs = await prisma.calendarSyncJob.findMany({ orderBy: { createdAt: 'desc' }, take: 10000 });
      data = jobs.map((j) => ({
        id: j.id,
        bookingId: j.bookingId,
        doctorId: j.doctorId,
        attempt: j.attempt,
        status: j.status,
        error: j.error,
        createdAt: j.createdAt.toISOString(),
        nextRetryAt: j.nextRetryAt?.toISOString(),
      }));
      break;
    }
    case 'activity': {
      const activity = await getCalendarActivity(10000);
      data = activity.items.map((a) => ({
        time: a.time.toISOString(),
        action: a.action,
        entityType: a.entityType,
        entityId: a.entityId,
        details: JSON.stringify(a.details),
      }));
      break;
    }
    default:
      throw new ValidationError(`Unknown export type: ${type}`);
  }

  if (format === 'csv') {
    if (data.length === 0) return { content: '', mimeType: 'text/csv', filename: `${type}-report.csv` };
    const headers = Object.keys(data[0]);
    const csvLines = [headers.join(','), ...data.map((row) => headers.map((h) => `"${String(row[h] ?? '').replace(/"/g, '""')}"`).join(','))];
    return { content: csvLines.join('\n'), mimeType: 'text/csv', filename: `${type}-report.csv` };
  }

  return { content: JSON.stringify(data, null, 2), mimeType: 'application/json', filename: `${type}-report.json` };
}

export async function getConfig() {
  const config = await prisma.calendarConfig.findUnique({ where: { id: 'singleton' } });
  return (config?.config as Record<string, unknown>) ?? {};
}

export async function updateConfig(updates: Record<string, unknown>) {
  const existing = await getConfig();
  const merged = { ...existing, ...updates };

  await prisma.calendarConfig.upsert({
    where: { id: 'singleton' },
    update: { config: merged as never },
    create: { id: 'singleton', config: merged as never },
  });

  return merged;
}

export async function getObservability() {
  const snapshot = metrics.snapshot() as Record<string, unknown>;

  const syncLatency = snapshot.googleCalendarSyncDuration as { count: number; sum: number; avg: number; max: number } | undefined;
  const reqLatency = snapshot.googleCalendarLatency as { count: number; sum: number; avg: number; max: number } | undefined;
  const failuresTotal = (snapshot.googleCalendarFailuresTotal as number) ?? 0;
  const requestsTotal = (snapshot.googleCalendarRequestsTotal as number) ?? 1;

  const topDoctors = await prisma.booking.groupBy({
    by: ['doctorId'],
    _count: { id: true },
    where: { calendarSynced: true },
    orderBy: { _count: { id: 'desc' } },
    take: 10,
  });

  const doctorNames = await prisma.doctor.findMany({
    where: { id: { in: topDoctors.map((d) => d.doctorId) } },
    select: { id: true, nameEn: true },
  });
  const nameMap = new Map(doctorNames.map((d) => [d.id, d.nameEn]));

  const audits = await prisma.auditLog.findMany({
    where: { action: { in: ['GOOGLE_EVENT_CREATED', 'GOOGLE_EVENT_UPDATED', 'GOOGLE_EVENT_DELETED', 'GOOGLE_EVENT_RECREATED', 'GOOGLE_SYNC_RETRY'] } },
    select: { action: true, duration: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
    take: 1000,
  });

  const durations = audits.filter((a) => a.duration != null).map((a) => a.duration!);
  const sorted = [...durations].sort((a, b) => a - b);

  const percentile = (p: number) => {
    if (sorted.length === 0) return 0;
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  };

  const successCount = audits.filter((a) => a.action !== 'GOOGLE_SYNC_RETRY').length;
  const failCount = audits.filter((a) => a.action === 'GOOGLE_SYNC_RETRY').length;
  const totalOps = successCount + failCount;

  return {
    syncTime: {
      avg: syncLatency?.avg ?? 0,
      p95: percentile(95),
      p99: percentile(99),
      max: syncLatency?.max ?? 0,
    },
    apiLatency: {
      avg: reqLatency?.avg ?? 0,
      max: reqLatency?.max ?? 0,
    },
    successRatio: totalOps > 0 ? Math.round((successCount / totalOps) * 10000) / 100 : 100,
    failureRatio: totalOps > 0 ? Math.round((failCount / totalOps) * 10000) / 100 : 0,
    requestsTotal,
    failuresTotal,
    webhookLatency: 0,
    retryLatency: 0,
    channelRenewalLatency: 0,
    topFailingDoctors: [],
    topFailingCalendars: [],
    mostActiveDoctors: topDoctors.map((d) => ({
      doctorId: d.doctorId,
      name: nameMap.get(d.doctorId) ?? 'Unknown',
      syncedCount: d._count.id,
    })),
    mostSyncedDoctors: topDoctors.map((d) => ({
      doctorId: d.doctorId,
      name: nameMap.get(d.doctorId) ?? 'Unknown',
      syncedCount: d._count.id,
    })),
  };
}

export async function cleanup(type: string, dryRun: boolean, requestId: string) {
  if (type === 'orphan_events') {
    const doctors = await prisma.doctor.findMany({ where: { isActive: true } });
    let toDelete = 0;

    for (const doctor of doctors) {
      try {
        const res = await google.events.list({
          calendarId: doctor.calendarId,
          timeMin: new Date(Date.now() - 7 * 86400000).toISOString(),
          maxResults: 250,
        });
        const events = (res.data.items ?? []) as Record<string, unknown>[];

        for (const event of events) {
          const eventId = event.id as string;
          const booking = await prisma.booking.findFirst({ where: { calendarEventId: eventId } });
          const blocked = await prisma.blockedSlot.findFirst({ where: { googleEventId: eventId } });
          if (!booking && !blocked) {
            toDelete++;
            if (!dryRun) {
              try {
                await google.events.delete({ calendarId: doctor.calendarId, eventId });
              } catch {
                // skip
              }
            }
          }
        }
      } catch {
        // skip doctor on API error
      }
    }

    return { type, dryRun, actionsFound: toDelete, actionsTaken: dryRun ? 0 : toDelete };
  }

  if (type === 'stale_retry_jobs') {
    const where = { status: 'failed' as const };
    const stats = await prisma.calendarSyncJob.findMany({ where, select: { id: true } });
    const count = stats.length;

    if (!dryRun) {
      await prisma.calendarSyncJob.deleteMany({ where });
    }

    return { type, dryRun, actionsFound: count, actionsTaken: dryRun ? 0 : count };
  }

  if (type === 'expired_channels') {
    const channels = await prisma.calendarChannel.findMany({ where: { expiration: { lte: new Date() } } });
    const count = channels.length;

    if (!dryRun) {
      for (const ch of channels) {
        try {
          await google.channels.stop({ requestBody: { id: ch.channelId, resourceId: ch.resourceId } });
        } catch {
          // skip
        }
      }
      await prisma.calendarChannel.deleteMany({ where: { id: { in: channels.map((c) => c.id) } } });
    }

    return { type, dryRun, actionsFound: count, actionsTaken: dryRun ? 0 : count };
  }

  if (type === 'expired_notifications') {
    const stats = await prisma.processedNotification.count();
    if (!dryRun) {
      const { cleanupExpiredEntries } = await import('./notificationDedup');
      await cleanupExpiredEntries();
    }
    return { type, dryRun, actionsFound: stats, actionsTaken: dryRun ? 0 : stats };
  }

  if (type === 'inconsistent_bookings') {
    const bookings = await prisma.booking.findMany({
      where: { calendarSynced: true, calendarEventId: null },
    });
    const count = bookings.length;

    if (!dryRun) {
      await prisma.booking.updateMany({
        where: { id: { in: bookings.map((b) => b.id) } },
        data: { calendarSynced: false },
      });
    }

    return { type, dryRun, actionsFound: count, actionsTaken: dryRun ? 0 : count };
  }

  if (type === 'stale_sync_tokens') {
    const cutoff = new Date(Date.now() - 7 * 86400000);
    const states = await prisma.calendarSyncState.findMany({
      where: { syncToken: { not: null }, lastSyncAt: { lt: cutoff } },
    });
    const count = states.length;

    if (!dryRun) {
      await prisma.calendarSyncState.updateMany({
        where: { id: { in: states.map((s) => s.id) } },
        data: { syncToken: null, fullSyncAt: new Date() },
      });
    }

    return { type, dryRun, actionsFound: count, actionsTaken: dryRun ? 0 : count };
  }

  if (type === 'all') {
    const results = [];
    for (const t of ['orphan_events', 'stale_retry_jobs', 'expired_channels', 'expired_notifications', 'inconsistent_bookings', 'stale_sync_tokens']) {
      const r = await cleanup(t, dryRun, requestId);
      results.push(r);
    }
    return { type: 'all', dryRun, results };
  }

  throw new ValidationError(`Unknown cleanup type: ${type}`);
}

export class NotFoundError extends Error {
  constructor(m: string) { super(m); this.name = 'NotFoundError'; }
}
export class ValidationError extends Error {
  constructor(m: string) { super(m); this.name = 'ValidationError'; }
}
