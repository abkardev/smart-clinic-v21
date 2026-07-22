import { prisma } from './prisma';
import { logger } from './logger';

const RENEWAL_WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_RENEWAL_RETRIES = 3;
const CLEANUP_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000;

export async function renewExpiringChannels(): Promise<{
  renewed: number;
  failed: number;
  skipped: number;
}> {
  const expiring = await prisma.calendarChannel.findMany({
    where: {
      status: { in: ['active', 'expiring'] },
      expiration: { lt: new Date(Date.now() + RENEWAL_WINDOW_MS) },
    },
  });

  let renewed = 0;
  let failed = 0;
  let skipped = 0;

  for (const channel of expiring) {
    try {
      if (channel.expiration <= new Date()) {
        await prisma.calendarChannel.update({
          where: { id: channel.id },
          data: { status: 'expired' },
        });
        skipped++;
        continue;
      }

      const { watchCalendar, stopChannel } = await import('./googleChannels');
      const doctor = await prisma.doctor.findUnique({ where: { id: channel.doctorId } });
      if (!doctor) {
        await prisma.calendarChannel.update({
          where: { id: channel.id },
          data: { status: 'stopped' },
        });
        skipped++;
        continue;
      }

      let renewalSuccess = false;
      for (let attempt = 1; attempt <= MAX_RENEWAL_RETRIES; attempt++) {
        try {
          await stopChannel(channel.channelId, channel.resourceId).catch(() => {});
          renewalSuccess = await watchCalendar(doctor);
          if (renewalSuccess) break;
        } catch (err) {
          logger.warn('Channel renewal attempt failed', {
            channelId: channel.channelId,
            attempt,
            maxAttempts: MAX_RENEWAL_RETRIES,
            error: String(err),
          });
          if (attempt < MAX_RENEWAL_RETRIES) {
            await new Promise((r) => setTimeout(r, 1000 * attempt));
          }
        }
      }

      if (renewalSuccess) {
        renewed++;
      } else {
        await prisma.calendarChannel.update({
          where: { id: channel.id },
          data: { status: 'error' },
        });
        failed++;
      }
    } catch (err) {
      logger.error('Unexpected error during channel renewal', {
        channelId: channel.channelId,
        error: String(err),
      });
      failed++;
    }
  }

  return { renewed, failed, skipped };
}

export async function cleanupObsoleteChannels(): Promise<number> {
  const cutoff = new Date(Date.now() - CLEANUP_THRESHOLD_MS);

  const obsolete = await prisma.calendarChannel.findMany({
    where: {
      status: { in: ['stopped', 'error'] },
      updatedAt: { lt: cutoff },
    },
  });

  if (obsolete.length === 0) return 0;

  const ids = obsolete.map((c) => c.id);
  await prisma.calendarChannel.deleteMany({
    where: { id: { in: ids } },
  });

  logger.info('Cleaned up obsolete channels', { count: obsolete.length });
  return obsolete.length;
}

export async function deduplicateChannels(): Promise<number> {
  const active = await prisma.calendarChannel.findMany({
    where: { status: { in: ['active', 'expiring'] } },
    orderBy: { createdAt: 'desc' },
  });

  const seen = new Map<string, string[]>();
  for (const ch of active) {
    const key = `${ch.doctorId}:${ch.calendarId}`;
    const existing = seen.get(key) ?? [];
    existing.push(ch.id);
    seen.set(key, existing);
  }

  let removed = 0;
  for (const [, ids] of seen) {
    if (ids.length > 1) {
      const [, ...dupes] = ids;
      await prisma.calendarChannel.updateMany({
        where: { id: { in: dupes } },
        data: { status: 'stopped' },
      });
      removed += dupes.length;
    }
  }

  if (removed > 0) {
    logger.info('Deduplicated channels', { removed });
  }

  return removed;
}

export async function getChannelHealth() {
  const now = new Date();
  const [active, expiring, expired, errored, stopped] = await Promise.all([
    prisma.calendarChannel.count({ where: { status: 'active', expiration: { gt: now } } }),
    prisma.calendarChannel.count({ where: { status: 'active', expiration: { lte: new Date(now.getTime() + RENEWAL_WINDOW_MS) } } }),
    prisma.calendarChannel.count({ where: { expiration: { lte: now } } }),
    prisma.calendarChannel.count({ where: { status: 'error' } }),
    prisma.calendarChannel.count({ where: { status: 'stopped' } }),
  ]);

  return { active, expiring, expired, errored, stopped, total: active + expiring + expired + errored + stopped };
}
