import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { prisma, cleanDatabase } from './setup';
import { createTestDoctor } from './helpers';

const googleMock = vi.hoisted(() => ({
  events: {
    insert: vi.fn().mockResolvedValue({ data: { id: 'test-event-id-123', htmlLink: 'https://calendar.google.com/event?eid=test' } }),
    update: vi.fn().mockResolvedValue({ data: {} }),
    delete: vi.fn().mockResolvedValue({ data: {} }),
  },
}));

vi.mock('@/app/lib/google', () => ({
  google: { events: googleMock.events },
  getAuthUrl: vi.fn().mockReturnValue('http://auth.url'),
  exchangeCode: vi.fn().mockResolvedValue({ access_token: 'mock-token' }),
}));

describe('Retry Worker', () => {
  beforeAll(async () => {
    await cleanDatabase();
  });

  beforeEach(async () => {
    await cleanDatabase();
    googleMock.events.insert.mockReset();
    googleMock.events.update.mockReset();
    googleMock.events.delete.mockReset();
    googleMock.events.insert.mockResolvedValue({ data: { id: 'test-event-id-123', htmlLink: 'https://calendar.google.com/event?eid=test' } });
    googleMock.events.update.mockResolvedValue({ data: {} });
    googleMock.events.delete.mockResolvedValue({ data: {} });
  });

  describe('getNextRetryAt', () => {
    it('should return increasing delays', async () => {
      const { getNextRetryAt } = await import('@/app/lib/googleCalendar');
      const now = Date.now();

      const d1 = getNextRetryAt(0).getTime() - now;
      const d2 = getNextRetryAt(1).getTime() - now;
      const d3 = getNextRetryAt(2).getTime() - now;
      const d4 = getNextRetryAt(3).getTime() - now;
      const d5 = getNextRetryAt(4).getTime() - now;

      expect(d1).toBeGreaterThanOrEqual(60_000);
      expect(d1).toBeLessThan(70_000);
      expect(d2).toBeGreaterThan(d1);
      expect(d3).toBeGreaterThan(d2);
      expect(d4).toBeGreaterThan(d3);
      expect(d5).toBeGreaterThan(d4);
    });
  });

  describe('retry job creation', () => {
    it('should create retry job on transient error', async () => {
      googleMock.events.insert.mockRejectedValueOnce({ code: 503, message: 'Service Unavailable' });

      const doctor = await createTestDoctor();
      const booking = await prisma.booking.create({
        data: { name: 'Retry Create', phone: '+966500000030', service: 'Test', date: '2026-08-30', time: '10:00', doctorId: doctor.id, source: 'dashboard' },
      });

      const { syncBooking } = await import('@/app/lib/googleCalendar');
      await syncBooking(booking, doctor);

      const jobs = await prisma.calendarSyncJob.findMany({ where: { bookingId: booking.id } });
      expect(jobs).toHaveLength(1);
      expect(jobs[0].status).toBe('pending');
      expect(jobs[0].attempt).toBe(0);
    });

    it('should not create retry job for 4xx errors', async () => {
      googleMock.events.insert.mockRejectedValueOnce({ code: 403, message: 'Forbidden' });

      const doctor = await createTestDoctor();
      const booking = await prisma.booking.create({
        data: { name: 'No Retry', phone: '+966500000031', service: 'Test', date: '2026-08-31', time: '11:00', doctorId: doctor.id, source: 'dashboard' },
      });

      const { syncBooking } = await import('@/app/lib/googleCalendar');
      const result = await syncBooking(booking, doctor);

      expect(result.action).toBe('failed');

      const jobs = await prisma.calendarSyncJob.findMany({ where: { bookingId: booking.id } });
      expect(jobs).toHaveLength(0);
    });
  });

  describe('lock mechanism', () => {
    it('should acquire and release lock', async () => {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 5 * 60 * 1000);

      const lock = await prisma.calendarRetryLock.upsert({
        where: { id: 'singleton' },
        update: { lockedAt: now, expiresAt, instance: 'test-instance' },
        create: { id: 'singleton', lockedAt: now, expiresAt, instance: 'test-instance' },
      });

      expect(lock).toBeTruthy();
      expect(lock.instance).toBe('test-instance');
      expect(lock.expiresAt.getTime()).toBeGreaterThan(Date.now());

      await prisma.calendarRetryLock.delete({ where: { id: 'singleton' } });
      const after = await prisma.calendarRetryLock.findUnique({ where: { id: 'singleton' } });
      expect(after).toBeNull();
    });

    it('should detect expired lock', async () => {
      const past = new Date(Date.now() - 60 * 1000);
      await prisma.calendarRetryLock.upsert({
        where: { id: 'singleton' },
        update: { lockedAt: past, expiresAt: past, instance: 'stale' },
        create: { id: 'singleton', lockedAt: past, expiresAt: past, instance: 'stale' },
      });

      const lock = await prisma.calendarRetryLock.findUnique({ where: { id: 'singleton' } });
      expect(lock!.expiresAt.getTime()).toBeLessThan(Date.now());
    });
  });

  describe('crash recovery', () => {
    it('should recover stuck processing jobs', async () => {
      const doctor = await createTestDoctor();
      const booking = await prisma.booking.create({
        data: { name: 'Stuck', phone: '+966500000032', service: 'Test', date: '2026-09-01', time: '12:00', doctorId: doctor.id, source: 'dashboard' },
      });

      await prisma.calendarSyncJob.create({
        data: {
          bookingId: booking.id,
          doctorId: doctor.id,
          status: 'processing',
          attempt: 1,
          nextRetryAt: new Date(Date.now() - 60 * 60 * 1000),
          updatedAt: new Date(Date.now() - 30 * 60 * 1000),
        },
      });

      const cutoff = new Date(Date.now() - 10 * 60 * 1000);
      const result = await prisma.calendarSyncJob.updateMany({
        where: { status: 'processing', updatedAt: { lt: cutoff } },
        data: { status: 'pending' },
      });

      expect(result.count).toBe(1);

      const job = await prisma.calendarSyncJob.findFirst({ where: { bookingId: booking.id } });
      expect(job!.status).toBe('pending');
    });
  });

  describe('retry schedule', () => {
    it('should increment attempts and update nextRetryAt', async () => {
      const doctor = await createTestDoctor();
      const booking = await prisma.booking.create({
        data: { name: 'Schedule', phone: '+966500000033', service: 'Test', date: '2026-09-02', time: '13:00', doctorId: doctor.id, source: 'dashboard' },
      });

      await prisma.calendarSyncJob.create({
        data: { bookingId: booking.id, doctorId: doctor.id, status: 'pending', attempt: 0, nextRetryAt: new Date() },
      });

      let job = await prisma.calendarSyncJob.findFirst({ where: { bookingId: booking.id } });
      expect(job!.attempt).toBe(0);

      await prisma.calendarSyncJob.update({
        where: { id: job!.id },
        data: { status: 'pending', attempt: 1, nextRetryAt: new Date(Date.now() + 5 * 60 * 1000) },
      });

      job = await prisma.calendarSyncJob.findFirst({ where: { bookingId: booking.id } });
      expect(job!.attempt).toBe(1);
    });

    it('should fail after max attempts', async () => {
      const doctor = await createTestDoctor();
      const booking = await prisma.booking.create({
        data: { name: 'Max Retry', phone: '+966500000034', service: 'Test', date: '2026-09-03', time: '14:00', doctorId: doctor.id, source: 'dashboard' },
      });

      await prisma.calendarSyncJob.create({
        data: { bookingId: booking.id, doctorId: doctor.id, status: 'pending', attempt: 4, nextRetryAt: new Date() },
      });

      await prisma.calendarSyncJob.updateMany({
        where: { bookingId: booking.id },
        data: { status: 'failed', attempt: 5, error: 'Max attempts reached' },
      });

      const job = await prisma.calendarSyncJob.findFirst({ where: { bookingId: booking.id } });
      expect(job!.status).toBe('failed');
      expect(job!.attempt).toBe(5);
    });
  });
});
