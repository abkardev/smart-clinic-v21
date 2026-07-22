import { prisma } from './prisma';
import { logger } from './logger';
import { logAudit } from './audit';
import type { Doctor } from '@prisma/client';
import { google } from './google';

const WEBHOOK_URL = process.env.NEXT_PUBLIC_APP_URL
  ? `${process.env.NEXT_PUBLIC_APP_URL}/api/google/webhook`
  : null;

const CHANNEL_TTL_SECONDS = 604800;

function getChannelId(doctorId: string): string {
  return `smartclinic-${doctorId}-${Date.now()}`;
}

export async function watchCalendar(doctor: Doctor): Promise<boolean> {
  if (!WEBHOOK_URL) {
    logger.warn('Cannot watch calendar — NEXT_PUBLIC_APP_URL not set');
    return false;
  }

  try {
    const channelId = getChannelId(doctor.id);
    const expiration = Date.now() + CHANNEL_TTL_SECONDS * 1000;

    const res = await google.events.watch({
      calendarId: doctor.calendarId,
      requestBody: {
        id: channelId,
        type: 'web_hook',
        address: WEBHOOK_URL,
        expiration: String(expiration),
        token: doctor.id,
      },
    });

    const resourceId = res.data.resourceId;
    if (!resourceId) {
      logger.warn('watchCalendar: no resourceId returned', { calendarId: doctor.calendarId });
      return false;
    }

    await prisma.calendarChannel.create({
      data: {
        doctorId: doctor.id,
        calendarId: doctor.calendarId,
        channelId,
        resourceId: resourceId,
        expiration: new Date(expiration),
        expiresAt: new Date(expiration),
        status: 'active',
      },
    });

    logAudit('GOOGLE_CHANNEL_CREATED', 'Doctor', doctor.id, { calendarId: doctor.calendarId, channelId, resourceId, expiration: new Date(expiration).toISOString() });
    logger.info('Calendar watch channel created', { doctorId: doctor.id, channelId, resourceId });
    return true;
  } catch (err) {
    logger.error('Failed to watch calendar', { doctorId: doctor.id, error: String(err) });
    return false;
  }
}

export async function stopChannel(channelId: string, resourceId: string): Promise<boolean> {
  try {
    await google.channels.stop({
      requestBody: { id: channelId, resourceId },
    });

    await prisma.calendarChannel.updateMany({
      where: { channelId },
      data: { status: 'stopped' },
    });

    logAudit('GOOGLE_CHANNEL_STOPPED', 'CalendarChannel', channelId, { resourceId });
    return true;
  } catch (err) {
    logger.error('Failed to stop channel', { channelId, error: String(err) });
    return false;
  }
}

export async function renewChannels(): Promise<{ renewed: number; failed: number }> {
  const expiring = await prisma.calendarChannel.findMany({
    where: {
      status: 'active',
      expiration: { lt: new Date(Date.now() + 24 * 60 * 60 * 1000) },
    },
  });

  let renewed = 0;
  let failed = 0;

  for (const channel of expiring) {
    const doctor = await prisma.doctor.findUnique({ where: { id: channel.doctorId } });
    if (!doctor) {
      await prisma.calendarChannel.update({ where: { id: channel.id }, data: { status: 'stopped' } });
      continue;
    }

    const stopped = await stopChannel(channel.channelId, channel.resourceId).catch(() => false);
    const watched = await watchCalendar(doctor);
    if (watched) {
      renewed++;
      logAudit('GOOGLE_CHANNEL_RENEWED', 'Doctor', doctor.id, { oldChannelId: channel.channelId, newExpiration: new Date(Date.now() + CHANNEL_TTL_SECONDS * 1000).toISOString() });
    } else {
      failed++;
    }
  }

  if (expiring.length > 0) {
    logger.info('Channel renewal completed', { expiring: expiring.length, renewed, failed });
  }

  return { renewed, failed };
}

export async function getActiveChannels(): Promise<number> {
  return prisma.calendarChannel.count({ where: { status: 'active' } });
}
