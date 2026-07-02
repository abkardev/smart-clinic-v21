import { prisma } from './prisma';
import type { BookingData } from './botMessages';
import { logger } from './logger';
import { metrics } from './metrics';

const SESSION_TTL_MS = 30 * 60 * 1000;

export class ConcurrencyError extends Error {
  constructor(public phone: string, public expectedVersion: number, public actualVersion: number) {
    super(`Session version conflict for ${phone}: expected ${expectedVersion}, actual ${actualVersion}`);
    this.name = 'ConcurrencyError';
  }
}

export interface SessionResult {
  id: string;
  phone: string;
  step: string;
  data: BookingData;
  sessionVersion: number;
  expiresAt: Date;
}

export async function getSession(phone: string): Promise<SessionResult | null> {
  const session = await prisma.whatsAppSession.findUnique({ where: { phone } });
  if (!session) return null;
  if (session.expiresAt < new Date()) {
    metrics.sessionsExpired.inc();
    logger.debug('[Session] expired', { phone });
    return null;
  }
  return {
    id: session.id,
    phone: session.phone,
    step: session.step,
    data: session.data as unknown as BookingData,
    sessionVersion: session.sessionVersion,
    expiresAt: session.expiresAt,
  };
}

export async function setSession(
  phone: string,
  step: string,
  data: BookingData,
  expectedVersion?: number
): Promise<SessionResult> {
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  if (expectedVersion !== undefined) {
    const result = await prisma.whatsAppSession.updateMany({
      where: { phone, sessionVersion: expectedVersion },
      data: {
        step: step as never,
        data: data as never,
        sessionVersion: { increment: 1 },
        expiresAt,
      },
    });

    if (result.count === 0) {
      metrics.sessionConflicts.inc();
      const current = await prisma.whatsAppSession.findUnique({ where: { phone } });
      const actualVersion = current?.sessionVersion ?? 0;
      throw new ConcurrencyError(phone, expectedVersion, actualVersion);
    }

    const updated = await prisma.whatsAppSession.findUnique({ where: { phone } });
    return {
      id: updated!.id,
      phone: updated!.phone,
      step: updated!.step,
      data: updated!.data as unknown as BookingData,
      sessionVersion: updated!.sessionVersion,
      expiresAt: updated!.expiresAt,
    };
  }

  const upserted = await prisma.whatsAppSession.upsert({
    where: { phone },
    create: {
      phone,
      step: step as never,
      data: data as never,
      sessionVersion: 1,
      expiresAt,
    },
    update: {
      step: step as never,
      data: data as never,
      sessionVersion: { increment: 1 },
      expiresAt,
    },
  });

  return {
    id: upserted.id,
    phone: upserted.phone,
    step: upserted.step,
    data: upserted.data as unknown as BookingData,
    sessionVersion: upserted.sessionVersion,
    expiresAt: upserted.expiresAt,
  };
}

export async function clearSession(phone: string): Promise<void> {
  await prisma.whatsAppSession.deleteMany({ where: { phone } });
}

export function isSessionExpired(session: SessionResult): boolean {
  return session.expiresAt < new Date();
}
