import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { prisma, cleanDatabase } from './setup';
import { createTestUser, createTestDoctor } from './helpers';

describe('Booking CRUD Lifecycle', () => {
  beforeAll(async () => {
    await cleanDatabase();
  });

  let doctorId: string;
  let adminToken: string;

  beforeEach(async () => {
    await cleanDatabase();
    const admin = await createTestUser();
    adminToken = admin.token;
    const doctor = await createTestDoctor();
    doctorId = doctor.id;
  });

  it('should create a booking', async () => {
    const booking = await prisma.booking.create({
      data: {
        name: 'John Doe',
        phone: '+966500000000',
        service: 'Consultation',
        date: '2026-08-01',
        time: '10:00',
        doctorId,
        source: 'dashboard',
      },
    });

    expect(booking.id).toBeTruthy();
    expect(booking.name).toBe('John Doe');
    expect(booking.status).toBe('pending');
    expect(booking.calendarSynced).toBe(false);
    expect(booking.calendarEventId).toBeNull();
  });

  it('should update a booking', async () => {
    const booking = await prisma.booking.create({
      data: { name: 'Jane', phone: '+966500000001', service: 'Checkup', date: '2026-08-01', time: '11:00', doctorId, source: 'dashboard' },
    });

    const updated = await prisma.booking.update({
      where: { id: booking.id },
      data: { name: 'Jane Updated', time: '14:00' },
    });

    expect(updated.name).toBe('Jane Updated');
    expect(updated.time).toBe('14:00');
  });

  it('should cancel a booking', async () => {
    const booking = await prisma.booking.create({
      data: { name: 'Bob', phone: '+966500000002', service: 'X-Ray', date: '2026-08-02', time: '09:00', doctorId, source: 'dashboard' },
    });

    const cancelled = await prisma.booking.update({
      where: { id: booking.id },
      data: { status: 'cancelled' as any },
    });

    expect(cancelled.status).toBe('cancelled');
  });

  it('should delete a booking', async () => {
    const booking = await prisma.booking.create({
      data: { name: 'Alice', phone: '+966500000003', service: 'Therapy', date: '2026-08-03', time: '15:00', doctorId, source: 'dashboard' },
    });

    await prisma.booking.delete({ where: { id: booking.id } });

    const found = await prisma.booking.findUnique({ where: { id: booking.id } });
    expect(found).toBeNull();
  });

  it('should mark booking as synced after calendar sync', async () => {
    const booking = await prisma.booking.create({
      data: { name: 'Sync Test', phone: '+966500000004', service: 'Dental', date: '2026-08-04', time: '10:30', doctorId, source: 'dashboard' },
    });

    await prisma.booking.update({
      where: { id: booking.id },
      data: { calendarEventId: 'cal-event-1', calendarLink: 'https://calendar.google.com/event', calendarSynced: true },
    });

    const synced = await prisma.booking.findUnique({ where: { id: booking.id } });
    expect(synced!.calendarSynced).toBe(true);
    expect(synced!.calendarEventId).toBe('cal-event-1');
  });

  it('should enforce unique doctorId+date+time constraint', async () => {
    await prisma.booking.create({
      data: { name: 'First', phone: '+966500000005', service: 'A', date: '2026-08-05', time: '10:00', doctorId, source: 'dashboard' },
    });

    await expect(
      prisma.booking.create({
        data: { name: 'Second', phone: '+966500000006', service: 'B', date: '2026-08-05', time: '10:00', doctorId, source: 'dashboard' },
      })
    ).rejects.toThrow();
  });
});
