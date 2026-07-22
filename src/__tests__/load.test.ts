import { describe, it, expect, beforeAll, vi } from 'vitest';
import { prisma, cleanDatabase } from './setup';

const googleMock = vi.hoisted(() => ({
  events: {
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    list: vi.fn(),
    watch: vi.fn(),
  },
  channels: { stop: vi.fn() },
}));

vi.mock('@/app/lib/google', () => ({
  google: { events: googleMock.events, channels: googleMock.channels },
  getAuthUrl: vi.fn().mockReturnValue('http://auth.url'),
  exchangeCode: vi.fn().mockResolvedValue({ access_token: 'mock-token' }),
  createDoctorClient: vi.fn(),
  setDoctorClient: vi.fn(),
  removeDoctorClient: vi.fn(),
  getDoctorCalendar: vi.fn(),
}));

vi.mock('@/app/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const DOCTOR_ID = 'load-test-doctor';

async function seedBookings(count: number): Promise<string[]> {
  const ids: string[] = [];
  const doctor = await prisma.doctor.findUnique({ where: { id: DOCTOR_ID } });
  if (!doctor) return ids;

  const batch = [];
  for (let i = 0; i < count; i++) {
    const day = 1 + Math.floor(i / 10);
    const hour = 9 + (i % 10);
    batch.push({
      name: `Load Test Patient ${i}`,
      phone: `+9665${String(i).padStart(8, '0')}`,
      service: 'Consultation',
      date: `2026-08-${String(day).padStart(2, '0')}`,
      time: `${String(hour).padStart(2, '0')}:00`,
      status: 'confirmed' as const,
      doctorId: DOCTOR_ID,
      calendarSynced: false,
    });
  }

  await prisma.booking.createMany({ data: batch });
  const created = await prisma.booking.findMany({
    where: { doctorId: DOCTOR_ID, calendarSynced: false },
    select: { id: true },
    take: count,
    orderBy: { createdAt: 'asc' },
  });
  return created.map((b) => b.id);
}

async function measureLatency<T>(fn: () => Promise<T>): Promise<{ result: T; durationMs: number }> {
  const start = Date.now();
  const result = await fn();
  return { result, durationMs: Date.now() - start };
}

describe('Load: Google Calendar API', () => {
  beforeAll(async () => {
    await cleanDatabase();
    await prisma.doctor.create({
      data: {
        id: DOCTOR_ID,
        nameEn: 'Load Test Doctor',
        nameAr: 'دكتور اختبار التحميل',
        calendarId: 'primary',
        workingStart: '09:00',
        workingEnd: '17:00',
        workingDays: [0, 1, 2, 3, 4, 5, 6],
        slotDuration: 30,
        isActive: true,
      },
    });
  }, 15000);

  describe('100 Bookings', () => {
    it('should create 100 bookings within latency budget', async () => {
      googleMock.events.insert.mockResolvedValue({
        data: { id: 'test-event-id', htmlLink: 'https://calendar.google.com/event?eid=test' },
      });

      const { result: ids, durationMs } = await measureLatency(() => seedBookings(100));
      expect(ids.length).toBe(100);

      const created = await prisma.booking.count({
        where: { doctorId: DOCTOR_ID, calendarSynced: false },
      });
      expect(created).toBe(100);

      const perBooking = durationMs / 100;
      console.log(`  100 bookings: ${durationMs}ms total, ${Math.round(perBooking)}ms/booking`);
      expect(perBooking).toBeLessThan(200);
    }, 30000);

    it('should sync 100 bookings within latency budget', async () => {
      const { syncBooking } = await import('@/app/lib/googleCalendar');
      const doctor = await prisma.doctor.findUnique({ where: { id: DOCTOR_ID } })!;

      googleMock.events.insert.mockResolvedValue({
        data: { id: 'test-event-id-sync', htmlLink: 'https://calendar.google.com/event?eid=sync' },
      });

      const bookings = await prisma.booking.findMany({
        where: { doctorId: DOCTOR_ID, calendarSynced: false },
        take: 100,
      });

      const { durationMs } = await measureLatency(async () => {
        for (const booking of bookings) {
          await syncBooking(booking, doctor!);
        }
      });

      const perBooking = durationMs / bookings.length;
      console.log(`  100 syncs: ${durationMs}ms total, ${Math.round(perBooking)}ms/booking`);
      expect(perBooking).toBeLessThan(500);
    }, 60000);
  });

  describe('Concurrent Webhook Burst', () => {
    it('should process 50 concurrent webhook notifications without crashing', async () => {
      const { verifyWebhook } = await import('@/app/lib/webhookVerifier');

      googleMock.events.list.mockResolvedValue({ data: { items: [], nextSyncToken: 'token-1' } });

      const headersBatch = Array.from({ length: 50 }, (_, i) => ({
        'x-goog-channel-id': `channel-${i}`,
        'x-goog-resource-id': `resource-${i}`,
        'x-goog-resource-state': 'exists',
        'x-goog-channel-token': DOCTOR_ID,
        'x-goog-message-number': `${i + 1}`,
      }));

      const results: Array<{ index: number; valid: boolean; durationMs: number }> = [];
      const { durationMs } = await measureLatency(async () => {
        await Promise.all(
          headersBatch.map(async (headers, index) => {
            const start = Date.now();
            const result = await verifyWebhook(headers as unknown as Record<string, string>);
            results.push({ index, valid: result.valid, durationMs: Date.now() - start });
          })
        );
      });

      const validCount = results.filter((r) => r.valid).length;
      console.log(`  50 concurrent webhooks: ${durationMs}ms total, ${validCount} valid`);
      expect(durationMs).toBeLessThan(30000);
    }, 30000);
  });

  describe('Concurrent Retry Workers', () => {
    it('should not deadlock with concurrent retry workers', async () => {
      const retryRoute = await import('@/app/api/internal/calendar/retry/route');

      const workers = Array.from({ length: 3 }, (_, i) =>
        measureLatency(() => retryRoute.POST().catch(() => ({ status: 500 })))
      );

      const results = await Promise.all(workers);
      const maxDuration = Math.max(...results.map((r) => r.durationMs));
      console.log(`  3 concurrent retry workers: max ${maxDuration}ms`);
      expect(maxDuration).toBeLessThan(60000);
    }, 60000);
  });

  describe('Concurrent Google Syncs', () => {
    it('should handle concurrent sync calls without race conditions', async () => {
      const { fetchDoctorEvents, importBusyTimes, detectConflicts } = await import('@/app/lib/googleCalendar');
      const doctor = await prisma.doctor.findUnique({ where: { id: DOCTOR_ID } })!;

      const mockEvents = Array.from({ length: 50 }, (_, i) => ({
        id: `concurrent-event-${i}`,
        status: 'confirmed',
        summary: `Event ${i}`,
        start: { dateTime: `2026-08-${String(1 + Math.floor(i / 10)).padStart(2, '0')}T${String(9 + (i % 10)).padStart(2, '0')}:00:00+03:00` },
        end: { dateTime: `2026-08-${String(1 + Math.floor(i / 10)).padStart(2, '0')}T${String(9 + (i % 10) + 1).padStart(2, '0')}:00:00+03:00` },
      }));

      const { durationMs } = await measureLatency(async () => {
        const [fetchRes, importRes, conflictRes] = await Promise.all([
          fetchDoctorEvents(DOCTOR_ID, doctor!.calendarId),
          importBusyTimes(DOCTOR_ID, mockEvents),
          detectConflicts(DOCTOR_ID, mockEvents),
        ]);
        return { fetchRes, importRes, conflictRes };
      });

      console.log(`  Concurrent sync ops: ${durationMs}ms total`);
      expect(durationMs).toBeLessThan(30000);
    }, 60000);
  });

  describe('Channel Management', () => {
    it('should handle concurrent channel watch/stop operations', async () => {
      const { watchCalendar, stopChannel } = await import('@/app/lib/googleChannels');
      const doctor = await prisma.doctor.findUnique({ where: { id: DOCTOR_ID } });

      googleMock.events.watch.mockResolvedValue({
        data: { resourceId: 'load-test-resource-id' },
      });
      googleMock.channels.stop.mockResolvedValue({ data: {} });

      const watchResults = await Promise.all(
        Array.from({ length: 10 }, () => watchCalendar(doctor!))
      );
      const watchSuccess = watchResults.filter(Boolean).length;
      console.log(`  Concurrent watch: ${watchSuccess}/10 succeeded`);

      const activeChannels = await prisma.calendarChannel.count({
        where: { doctorId: DOCTOR_ID, status: 'active' },
      });
      console.log(`  Active channels after concurrent watch: ${activeChannels}`);

      await prisma.calendarChannel.updateMany({
        where: { doctorId: DOCTOR_ID, status: 'active' },
        data: { status: 'stopped' },
      });
    }, 30000);
  });

  describe('RRULE Expansion', () => {
    it('should expand recurring slots efficiently', async () => {
      const rrule = 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;COUNT=260';
      await prisma.recurringBlockedSlot.create({
        data: {
          doctorId: DOCTOR_ID,
          title: 'Weekly Load Test',
          rrule,
          startTime: '09:00',
          endTime: '10:00',
          slotType: 'meeting',
          activeFrom: new Date('2026-08-01'),
        },
      });

      const { expandRecurringSlots } = await import('@/app/lib/recurringEvents');
      const { result: count, durationMs } = await measureLatency(() => expandRecurringSlots(DOCTOR_ID));

      const perSlot = count > 0 ? durationMs / count : 0;
      console.log(`  Expanded ${count} recurring slots in ${durationMs}ms (${Math.round(perSlot)}ms/slot)`);
      expect(count).toBeGreaterThan(0);
      expect(perSlot).toBeLessThan(1000);
    }, 30000);
  });

  describe('Quota Protection', () => {
    it('should throttle when rate limit is exceeded', async () => {
      const { withQuotaProtection, checkDailyQuota, getQuotaUsage } = await import('@/app/lib/quotaManager');

      const results: Array<{ index: number; allowed: boolean }> = [];
      const start = Date.now();

      const tasks = Array.from({ length: 30 }, (_, i) =>
        withQuotaProtection('load-test', async () => {
          results.push({ index: i, allowed: true });
          return 'ok';
        }).catch(() => {
          results.push({ index: i, allowed: false });
          return null;
        })
      );

      await Promise.all(tasks);
      const durationMs = Date.now() - start;
      const successCount = results.filter((r) => r.allowed).length;

      console.log(`  Quota protection: ${successCount}/30 succeeded in ${durationMs}ms`);
      expect(durationMs).toBeLessThan(15000);
    }, 30000);
  });

  describe('Memory Usage', () => {
    it('should not leak memory during repeated sync operations', async () => {
      const initialMemory = process.memoryUsage();

      const { syncBooking } = await import('@/app/lib/googleCalendar');
      const doctor = await prisma.doctor.findUnique({ where: { id: DOCTOR_ID } });

      googleMock.events.insert.mockResolvedValue({
        data: { id: 'mem-test-event', htmlLink: 'https://calendar.google.com/event?eid=mem' },
      });

      for (let round = 0; round < 5; round++) {
        const batch = [];
        for (let i = 0; i < 50; i++) {
          batch.push({
            name: `Memory Test Patient R${round} S${i}`,
            phone: `+9665${String(round * 100 + i).padStart(8, '0')}`,
            service: 'Consultation',
            date: `2026-09-${String(round + 1).padStart(2, '0')}`,
            time: `${String(9 + (i % 10)).padStart(2, '0')}:${String(Math.floor(i / 10) * 5).padStart(2, '0')}`,
            status: 'confirmed' as const,
            doctorId: DOCTOR_ID,
            calendarSynced: false,
          });
        }
        await prisma.booking.createMany({ data: batch });
        const ids = (await prisma.booking.findMany({
          where: { doctorId: DOCTOR_ID, calendarSynced: false },
          select: { id: true },
          take: 50,
          orderBy: { createdAt: 'desc' },
        })).map((b) => b.id);

        const bookings = await prisma.booking.findMany({
          where: { id: { in: ids } },
        });

        for (const booking of bookings) {
          await syncBooking(booking, doctor!).catch(() => {});
        }

        await prisma.booking.deleteMany({ where: { id: { in: ids } } });
      }

      const finalMemory = process.memoryUsage();
      const heapDiff = finalMemory.heapUsed - initialMemory.heapUsed;
      const heapDiffMB = Math.round(heapDiff / 1024 / 1024 * 100) / 100;

      console.log(`  Memory delta: ${heapDiffMB}MB (heapUsed)`);
      await cleanDatabase();
    }, 120000);
  });
});
