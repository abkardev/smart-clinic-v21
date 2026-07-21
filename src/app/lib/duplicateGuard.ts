import { prisma } from './prisma';
import { logger } from './logger';

const PROCESSED_TTL_MS = 24 * 60 * 60 * 1000;
const CLEANUP_EVERY = 1000;
let cleanupCounter = 0;

export async function isDuplicateMessage(
  messageId: string,
  source: string,
  userId: string,
  correlationId: string
): Promise<boolean> {
  if (!messageId) return false;

  try {
    const existing = await prisma.processedMessage.findUnique({ where: { messageId } });
    if (existing) {
      const ageMs = Date.now() - existing.processedAt.getTime();
      logger.warn('[Dedup] Duplicate message detected', {
        messageId, source, userId, correlationId,
        originalProcessedAt: existing.processedAt.toISOString(),
        ageMs,
      });
      return true;
    }

    await prisma.processedMessage.create({
      data: {
        messageId,
        source,
        userId,
        expiresAt: new Date(Date.now() + PROCESSED_TTL_MS),
      },
    });

    cleanupCounter++;
    if (cleanupCounter >= CLEANUP_EVERY) {
      cleanupCounter = 0;
      cleanupExpired().catch(() => {});
    }

    return false;
  } catch (err: unknown) {
    const e = err as { code?: string };
    if (e.code === 'P2002') {
      logger.warn('[Dedup] Duplicate detected via unique constraint', { messageId, correlationId });
      return true;
    }
    logger.error('[Dedup] Error checking duplicate', { error: String(err), messageId, correlationId });
    return false;
  }
}

async function cleanupExpired() {
  try {
    const result = await prisma.processedMessage.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
    if (result.count > 0) {
      logger.debug('[Dedup] Cleaned up expired messages', { count: result.count });
    }
  } catch (err) {
    logger.warn('Failed to cleanup expired messages', { error: String(err) });
  }
}
