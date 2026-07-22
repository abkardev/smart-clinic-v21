import { prisma } from './prisma';
import { logger } from './logger';

interface CleanupResults {
  expiredSessionsRemoved: number;
  oldRateLimitsRemoved: number;
  oldRetryJobsRemoved: number;
  oldIdempotencyLocksRemoved: number;
  expiredPasswordTokensCleared: number;
  oldAuditLogsRemoved: number;
  durationMs: number;
}

export async function runCleanup(): Promise<CleanupResults> {
  const start = Date.now();

  const now = new Date();

  const [expiredSessionsRemoved, oldRateLimitsRemoved, oldRetryJobsRemoved, oldIdempotencyLocksRemoved, oldAuditLogsRemoved] = await Promise.all([
    prisma.whatsAppSession.deleteMany({ where: { expiresAt: { lt: now } } }).then(r => r.count),
    prisma.rateLimit.deleteMany({ where: { expiresAt: { lt: now } } }).then(r => r.count),
    prisma.calendarSyncJob.deleteMany({
      where: {
        OR: [
          { status: 'completed', createdAt: { lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
          { status: 'failed', createdAt: { lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
        ],
      },
    }).then(r => r.count),
    prisma.idempotencyLock.deleteMany({ where: { expiresAt: { lt: now } } }).then(r => r.count),
    prisma.auditLog.deleteMany({
      where: { createdAt: { lt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) } },
    }).then(r => r.count),
  ]);

  let expiredPasswordTokensCleared = 0;
  const tokens = await prisma.user.findMany({
    where: { resetPasswordToken: { not: null } },
    select: { id: true, resetPasswordToken: true },
  });
  for (const user of tokens) {
    await prisma.user.update({
      where: { id: user.id },
      data: { resetPasswordToken: null },
    });
    expiredPasswordTokensCleared++;
  }

  const durationMs = Date.now() - start;

  logger.info('Cleanup completed', {
    expiredSessionsRemoved,
    oldRateLimitsRemoved,
    oldRetryJobsRemoved,
    oldIdempotencyLocksRemoved,
    expiredPasswordTokensCleared,
    oldAuditLogsRemoved,
    durationMs,
  });

  return {
    expiredSessionsRemoved,
    oldRateLimitsRemoved,
    oldRetryJobsRemoved,
    oldIdempotencyLocksRemoved,
    expiredPasswordTokensCleared,
    oldAuditLogsRemoved,
    durationMs,
  };
}
