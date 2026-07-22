import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { prisma, cleanDatabase } from './setup';
import { createTestDoctor } from './helpers';

describe('Performance Smoke Tests', () => {
  let doctorId: string;

  beforeAll(async () => {
    await cleanDatabase();
    const doctor = await createTestDoctor();
    doctorId = doctor.id;
  });

  beforeEach(async () => {
    await prisma.booking.deleteMany({ where: { doctorId } });
    await prisma.auditLog.deleteMany();
  });

  async function createBookingsSequential(count: number) {
    const batchSize = 50;
    const services = ['Consultation', 'Checkup', 'Dental', 'X-Ray', 'Therapy', 'Surgery'];
    let created = 0;
    const startTime = Date.now();

    for (let start = 0; start < count; start += batchSize) {
      const end = Math.min(start + batchSize, count);
      const batch = [];
      for (let i = start; i < end; i++) {
        const day = Math.floor(i / 10) + 1;
        const hour = (i % 10) + 8;
        batch.push(
          prisma.booking.create({
            data: {
              name: `Patient ${i}`,
              phone: `+9665000${String(i).padStart(4, '0')}`,
              service: services[i % services.length],
              date: `2026-10-${String(day).padStart(2, '0')}`,
              time: `${String(hour).padStart(2, '0')}:00`,
              doctorId,
              source: 'dashboard',
            },
          })
        );
      }
      const results = await Promise.all(batch);
      created += results.length;
    }

    return { count: created, elapsed: Date.now() - startTime };
  }

  it('should create 100 bookings within time limit', async () => {
    const { count, elapsed } = await createBookingsSequential(100);
    expect(count).toBe(100);
    expect(elapsed).toBeLessThan(30000);
  });

  it('should create 500 bookings within time limit', async () => {
    await prisma.booking.deleteMany({ where: { doctorId } });
    const { count, elapsed } = await createBookingsSequential(500);
    expect(count).toBe(500);
    expect(elapsed).toBeLessThan(60000);
  });

  it('should create 1000 bookings within time limit', { timeout: 120000 }, async () => {
    await prisma.booking.deleteMany({ where: { doctorId } });
    const { count, elapsed } = await createBookingsSequential(1000);
    expect(count).toBe(1000);
    expect(elapsed).toBeLessThan(120000);
  });

  it('should query bookings efficiently', async () => {
    await createBookingsSequential(100);

    const start = Date.now();
    const bookings = await prisma.booking.findMany({
      where: { doctorId },
      orderBy: { date: 'asc' },
      take: 100,
    });
    const elapsed = Date.now() - start;

    expect(bookings.length).toBe(100);
    expect(elapsed).toBeLessThan(2000);
  });

  it('should update all booking statuses in batch', async () => {
    await createBookingsSequential(100);

    const start = Date.now();
    const result = await prisma.booking.updateMany({
      where: { doctorId },
      data: { status: 'confirmed' as any },
    });
    const elapsed = Date.now() - start;

    expect(result.count).toBe(100);
    expect(elapsed).toBeLessThan(5000);

    const confirmed = await prisma.booking.count({
      where: { doctorId, status: 'confirmed' as any },
    });
    expect(confirmed).toBe(100);
  });

  it('should verify no duplicate calendar events after bulk operations', async () => {
    await createBookingsSequential(20);

    // Simulate calendar sync for all
    const start = Date.now();
    const bookings = await prisma.booking.findMany({ where: { doctorId, calendarSynced: false } });

    for (const booking of bookings) {
      await prisma.booking.update({
        where: { id: booking.id },
        data: {
          calendarEventId: `event-${booking.id}`,
          calendarLink: `https://calendar.google.com/event?eid=${booking.id}`,
          calendarSynced: true,
        },
      });
    }

    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(10000);

    // Verify no duplicates
    const eventIds = await prisma.booking.findMany({
      where: { doctorId, calendarEventId: { not: null } },
      select: { calendarEventId: true },
    });
    const uniqueIds = new Set(eventIds.map(e => e.calendarEventId));
    expect(uniqueIds.size).toBe(eventIds.length);
  });
});
