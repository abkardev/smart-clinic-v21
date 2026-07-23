export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { logger } from '@/app/lib/logger';
import { logAudit } from '@/app/lib/audit';
import { google } from '@/app/lib/google';

async function processSync(doctorId: string): Promise<void> {
  const syncState = await prisma.calendarSyncState.findUnique({ where: { doctorId } });
  const doctor = await prisma.doctor.findUnique({ where: { id: doctorId } });
  if (!doctor) return;

  const pageToken = syncState?.syncToken;
  const listParams: Record<string, unknown> = { calendarId: doctor.calendarId, maxResults: 250 };

  if (pageToken) {
    listParams.syncToken = pageToken;
  } else {
    listParams.timeMin = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  }

  try {
    const response = await google.events.list(listParams);
    const events = response.data.items ?? [];
    const nextSyncToken = response.data.nextSyncToken;

    for (const event of events) {
      await handleGoogleEvent(event as Record<string, unknown>, doctorId);
    }

    if (nextSyncToken) {
      await prisma.calendarSyncState.upsert({
        where: { doctorId },
        update: { syncToken: nextSyncToken, lastSyncAt: new Date() },
        create: { doctorId, calendarId: doctor.calendarId, syncToken: nextSyncToken },
      });
      logAudit('GOOGLE_SYNC_TOKEN_UPDATED', 'Doctor', doctorId, { hasSyncToken: true });
    }
  } catch (err) {
    const gErr = err as { code?: number };
    if (gErr.code === 410) {
      await prisma.calendarSyncState.update({
        where: { doctorId },
        data: { syncToken: null, fullSyncAt: new Date() },
      }).catch(() => {});
    }
    logger.warn('Incremental sync failed, will retry', { doctorId, error: String(err) });
  }
}

async function handleGoogleEvent(event: Record<string, unknown>, doctorId: string): Promise<void> {
  const eventId = event.id as string;
  const status = event.status as string;
  const summary = (event.summary as string) ?? '';
  const start = event.start as Record<string, string> | undefined;
  const end = event.end as Record<string, string> | undefined;

  if (!eventId || !start?.dateTime) return;

  const startDate = new Date(start.dateTime);
  const endDate = end?.dateTime ? new Date(end.dateTime) : new Date(startDate.getTime() + 30 * 60000);
  const dateStr = startDate.toISOString().split('T')[0];
  const timeStr = `${String(startDate.getHours()).padStart(2, '0')}:${String(startDate.getMinutes()).padStart(2, '0')}`;

  const existingBooking = await prisma.booking.findFirst({
    where: { calendarEventId: eventId },
  });

  const existingBlocked = await prisma.blockedSlot.findFirst({
    where: { googleEventId: eventId },
  });

  if (status === 'cancelled') {
    if (existingBooking && existingBooking.status !== 'cancelled') {
      await prisma.booking.update({
        where: { id: existingBooking.id },
        data: { status: 'cancelled', calendarSynced: false, calendarEventId: null },
      });
      logAudit('GOOGLE_CONFLICT_DETECTED', 'Booking', existingBooking.id, { conflictType: 'deleted', eventId });
    }
    if (existingBlocked) {
      await prisma.blockedSlot.delete({ where: { id: existingBlocked.id } });
      logAudit('SLOT_UNBLOCKED', 'Doctor', doctorId, { date: existingBlocked.date, time: existingBlocked.time, reason: 'calendar_sync' });
    }
    return;
  }

  if (summary.includes('Out of office') || summary.includes('Vacation') || summary.includes('Meeting') || summary.includes('Personal') || summary.includes('Conference')) {
    const blockedExists = await prisma.blockedSlot.findFirst({
      where: { doctorId, date: dateStr, time: timeStr },
    });
    if (!blockedExists) {
      await prisma.blockedSlot.create({
        data: {
          doctorId,
          date: dateStr,
          time: timeStr,
          reason: summary,
          isWholeDay: !timeStr,
          syncedToGoogle: true,
          googleEventId: eventId,
          blockingSource: 'google_import',
        },
      });
      logAudit('GOOGLE_BUSY_IMPORTED', 'Doctor', doctorId, { eventId, summary, date: dateStr, time: timeStr });
    }
    return;
  }

  if (existingBooking) {
    if (existingBooking.date !== dateStr || existingBooking.time !== timeStr) {
      await prisma.booking.update({
        where: { id: existingBooking.id },
        data: { date: dateStr, time: timeStr },
      });
      logAudit('GOOGLE_CONFLICT_DETECTED', 'Booking', existingBooking.id, { conflictType: 'moved', from: `${existingBooking.date}T${existingBooking.time}`, to: `${dateStr}T${timeStr}`, eventId });
    }

    const durationMs = endDate.getTime() - startDate.getTime();
    if (Math.abs(durationMs - 30 * 60000) > 60000) {
      logAudit('GOOGLE_CONFLICT_DETECTED', 'Booking', existingBooking.id, { conflictType: 'resized', durationMs, eventId });
    }
  }
}

export async function POST(req: NextRequest) {
  try {
    const channelId = req.headers.get('x-goog-channel-id');
    const resourceId = req.headers.get('x-goog-resource-id');
    const resourceState = req.headers.get('x-goog-resource-state');
    const channelToken = req.headers.get('x-goog-channel-token');

    const messageNumber = req.headers.get('x-goog-message-number');
    if (messageNumber && parseInt(messageNumber) > 1) {
      return new NextResponse('OK', { status: 200 });
    }

    if (!channelId || !resourceId || !resourceState) {
      logger.warn('Webhook: missing headers', { channelId, resourceId, resourceState });
      return new NextResponse('Missing headers', { status: 400 });
    }

    const channel = await prisma.calendarChannel.findUnique({ where: { channelId } });
    if (!channel || channel.resourceId !== resourceId) {
      logger.warn('Webhook: invalid channel/resource', { channelId, resourceId });
      return new NextResponse('Invalid channel', { status: 404 });
    }

    if (channel.status !== 'active') {
      return new NextResponse('Channel not active', { status: 200 });
    }

    const doctorId = channel.doctorId;
    if (channelToken && channelToken !== doctorId) {
      logger.warn('Webhook: token mismatch', { channelToken, expected: doctorId });
      return new NextResponse('Token mismatch', { status: 403 });
    }

    logAudit('GOOGLE_WEBHOOK_RECEIVED', 'Doctor', doctorId, {
      channelId, resourceId, resourceState, messageNumber,
    });

    if (resourceState === 'sync') {
      return new NextResponse('Sync notification', { status: 200 });
    }

    if (resourceState === 'exists') {
      await processSync(doctorId);
      logAudit('GOOGLE_WEBHOOK_PROCESSED', 'Doctor', doctorId, { resourceState, channelId });
    }

    return new NextResponse('OK', { status: 200 });
  } catch (err) {
    logger.error('Webhook handler error', { error: String(err) });
    return new NextResponse('Server error', { status: 500 });
  }
}
