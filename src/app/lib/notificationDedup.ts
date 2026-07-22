import { prisma } from './prisma';
import { logger } from './logger';

const DEDUP_CLEANUP_INTERVAL = 60 * 60 * 1000;
const DEDUP_TTL_MS = 24 * 60 * 60 * 1000;
let lastCleanup = 0;

interface DedupEntry {
  channelId: string;
  resourceId: string;
  messageNumber: number;
  processedAt: Date;
}

function getDedupKey(channelId: string, resourceId: string, messageNumber: number): string {
  return `${channelId}::${resourceId}::${messageNumber}`;
}

export async function isNotificationProcessed(
  channelId: string,
  resourceId: string,
  messageNumber: number,
): Promise<boolean> {
  const key = getDedupKey(channelId, resourceId, messageNumber);

  const existing = await prisma.processedNotification.findUnique({ where: { notificationKey: key } });
  if (existing) {
    if (existing.processedAt > new Date(Date.now() - DEDUP_TTL_MS)) {
      return true;
    }
    await prisma.processedNotification.delete({ where: { notificationKey: key } }).catch(() => {});
  }

  return false;
}

export async function markNotificationProcessed(
  channelId: string,
  resourceId: string,
  messageNumber: number,
): Promise<void> {
  const key = getDedupKey(channelId, resourceId, messageNumber);

  await prisma.processedNotification.upsert({
    where: { notificationKey: key },
    update: { processedAt: new Date() },
    create: {
      notificationKey: key,
      channelId,
      resourceId,
      messageNumber,
      processedAt: new Date(),
      expiresAt: new Date(Date.now() + DEDUP_TTL_MS),
    },
  }).catch((err) => {
    logger.warn('Failed to mark notification as processed (possible duplicate)', {
      key,
      error: String(err),
    });
  });
}

export async function cleanupExpiredEntries(): Promise<number> {
  const now = Date.now();
  if (now - lastCleanup < DEDUP_CLEANUP_INTERVAL) {
    return 0;
  }

  lastCleanup = now;
  const cutoff = new Date(now - DEDUP_TTL_MS);

  const { count } = await prisma.processedNotification.deleteMany({
    where: { processedAt: { lt: cutoff } },
  });

  if (count > 0) {
    logger.info('Cleaned up expired dedup entries', { count });
  }

  return count;
}

export async function getDedupStats(): Promise<{
  total: number;
  oldestEntry: Date | null;
  ttlHours: number;
}> {
  const [total, oldest] = await Promise.all([
    prisma.processedNotification.count(),
    prisma.processedNotification.findFirst({
      orderBy: { processedAt: 'asc' },
      select: { processedAt: true },
    }),
  ]);

  return {
    total,
    oldestEntry: oldest?.processedAt ?? null,
    ttlHours: DEDUP_TTL_MS / (1000 * 60 * 60),
  };
}
