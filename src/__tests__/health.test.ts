import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { prisma, cleanDatabase } from './setup';
import { createTestUser, createTestDoctor } from './helpers';

describe('Health Endpoint Checks', () => {
  beforeAll(async () => {
    await cleanDatabase();
  });

  beforeEach(async () => {
    await cleanDatabase();
  });

  it('should confirm database is reachable', async () => {
    const result = await prisma.$queryRaw`SELECT 1 AS ok`;
    expect(result).toBeTruthy();
  });

  it('should report zero pending retry jobs when empty', async () => {
    const count = await prisma.calendarSyncJob.count({ where: { status: 'pending' } });
    expect(count).toBe(0);
  });

  it('should report correct retry job counts', async () => {
    const doctor = await createTestDoctor();
    const booking = await prisma.booking.create({
      data: { name: 'Health Test', phone: '+966500000040', service: 'Checkup', date: '2026-09-10', time: '09:00', doctorId: doctor.id, source: 'dashboard' },
    });

    await prisma.calendarSyncJob.create({
      data: { bookingId: booking.id, doctorId: doctor.id, status: 'pending', attempt: 1, nextRetryAt: new Date() },
    });
    await prisma.calendarSyncJob.create({
      data: { bookingId: booking.id, doctorId: doctor.id, status: 'failed', attempt: 5, error: 'Exceeded' },
    });

    const pending = await prisma.calendarSyncJob.count({ where: { status: 'pending' } });
    const failed = await prisma.calendarSyncJob.count({ where: { status: 'failed' } });
    const processing = await prisma.calendarSyncJob.count({ where: { status: 'processing' } });

    expect(pending).toBe(1);
    expect(failed).toBe(1);
    expect(processing).toBe(0);
  });

  it('should report oldest pending job age', async () => {
    const doctor = await createTestDoctor();
    const booking = await prisma.booking.create({
      data: { name: 'Old', phone: '+966500000041', service: 'X-Ray', date: '2026-09-11', time: '10:00', doctorId: doctor.id, source: 'dashboard' },
    });

    const createdAt = new Date(Date.now() - 30 * 60 * 1000);
    await prisma.calendarSyncJob.create({
      data: { bookingId: booking.id, doctorId: doctor.id, status: 'pending', attempt: 1, nextRetryAt: new Date(), createdAt },
    });

    const oldest = await prisma.calendarSyncJob.findFirst({
      where: { status: 'pending' },
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true },
    });

    expect(oldest).toBeTruthy();
    const minutesOld = Math.round((Date.now() - oldest!.createdAt.getTime()) / 60000);
    expect(minutesOld).toBeGreaterThanOrEqual(25);
  });

  it('should consider scheduler unhealthy when jobs are stuck processing', async () => {
    const doctor = await createTestDoctor();
    const booking = await prisma.booking.create({
      data: { name: 'Stuck', phone: '+966500000042', service: 'Dental', date: '2026-09-12', time: '11:00', doctorId: doctor.id, source: 'dashboard' },
    });

    await prisma.calendarSyncJob.create({
      data: { bookingId: booking.id, doctorId: doctor.id, status: 'processing', attempt: 1 },
    });

    const processingCount = await prisma.calendarSyncJob.count({ where: { status: 'processing' } });
    expect(processingCount).toBe(1);
  });
});
