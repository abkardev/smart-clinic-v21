import { prisma } from './prisma';
import type { BookingData } from './botMessages';
import { BookingSource } from '@prisma/client';
import { logger } from './logger';
import { metrics } from './metrics';

const LOCK_TTL_MS = 10_000;

export interface BookingResult {
  id: string;
  created: boolean;
  existing?: boolean;
}

export async function createBookingIdempotent(
  userId: string,
  data: BookingData,
  source: BookingSource,
  correlationId: string
): Promise<BookingResult> {
  const phone = source === BookingSource.instagram && data.whatsappNumber
    ? data.whatsappNumber
    : userId;

  const idempotencyKey = `booking:${data.doctorId}:${data.date}:${data.time}:${phone}`;

  return prisma.$transaction(async (tx) => {
    const existingLock = await tx.idempotencyLock.findUnique({ where: { key: idempotencyKey } });
    if (existingLock) {
      if (existingLock.status === 'completed' && existingLock.bookingId) {
        logger.info('[BookingLock] Idempotent — returning existing booking', {
          key: idempotencyKey, bookingId: existingLock.bookingId, correlationId,
        });
        return { id: existingLock.bookingId, created: false, existing: true };
      }
      if (existingLock.expiresAt > new Date()) {
        logger.warn('[BookingLock] Lock active, another request in progress', {
          key: idempotencyKey, correlationId,
        });
        throw new Error('Booking already in progress');
      }
      await tx.idempotencyLock.delete({ where: { key: idempotencyKey } });
    }

    await tx.idempotencyLock.create({
      data: {
        key: idempotencyKey,
        status: 'locked',
        expiresAt: new Date(Date.now() + LOCK_TTL_MS),
      },
    });

    try {
      const booking = await tx.booking.create({
        data: {
          name: data.name!,
          phone,
          service: data.serviceAr!,
          date: data.date!,
          time: data.time!,
          doctorId: data.doctorId!,
          source,
          status: 'confirmed',
          notes: `Best time to call: ${data.callTimeEn}${data.whatsappNumber ? ` | WhatsApp: ${data.whatsappNumber}` : ''}`,
        },
      });

      await tx.idempotencyLock.update({
        where: { key: idempotencyKey },
        data: { status: 'completed', bookingId: booking.id },
      });

      return { id: booking.id, created: true };
    } catch (err: unknown) {
      const e = err as { code?: string; meta?: unknown };

      await tx.idempotencyLock.update({
        where: { key: idempotencyKey },
        data: { status: 'failed' },
      }).catch(() => {});

      if (e.code === 'P2002') {
        const existing = await tx.booking.findFirst({
          where: { doctorId: data.doctorId!, date: data.date!, time: data.time! },
          select: { id: true },
        });
        if (existing) {
          logger.info('[BookingLock] Unique constraint — returning existing', {
            key: idempotencyKey, bookingId: existing.id, correlationId,
          });
          return { id: existing.id, created: false, existing: true };
        }
      }

      throw err;
    }
  });
}
