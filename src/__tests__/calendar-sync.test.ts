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

describe('Google Calendar Sync', () => {
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

  describe('createCalendarEvent', () => {
    it('should create a calendar event successfully', async () => {
      const doctor = await createTestDoctor();
      const booking = await prisma.booking.create({
        data: { name: 'Test', phone: '+966500000010', service: 'Checkup', date: '2026-08-10', time: '09:00', doctorId: doctor.id, source: 'dashboard' },
      });

      const { createCalendarEvent } = await import('@/app/lib/googleCalendar');
      const result = await createCalendarEvent(booking, doctor);

      expect(result).toBeTruthy();
      expect(result!.calendarEventId).toBe('test-event-id-123');
      expect(googleMock.events.insert).toHaveBeenCalledTimes(1);
    });

    it('should throw on transient 5xx error', async () => {
      googleMock.events.insert.mockRejectedValueOnce({ code: 503, message: 'Service Unavailable' });

      const doctor = await createTestDoctor();
      const booking = await prisma.booking.create({
        data: { name: 'Fail Test', phone: '+966500000011', service: 'X-Ray', date: '2026-08-11', time: '10:00', doctorId: doctor.id, source: 'dashboard' },
      });

      const { createCalendarEvent } = await import('@/app/lib/googleCalendar');
      await expect(createCalendarEvent(booking, doctor)).rejects.toThrow();
    });
  });

  describe('updateCalendarEvent', () => {
    it('should update an existing calendar event', async () => {
      const doctor = await createTestDoctor();
      const booking = await prisma.booking.create({
        data: { name: 'Update Test', phone: '+966500000012', service: 'Dental', date: '2026-08-12', time: '11:00', doctorId: doctor.id, source: 'dashboard', calendarEventId: 'existing-event-id', calendarSynced: true },
      });

      const { updateCalendarEvent } = await import('@/app/lib/googleCalendar');
      await updateCalendarEvent(booking, doctor);

      expect(googleMock.events.update).toHaveBeenCalledTimes(1);
    });

    it('should throw on 404 for recreation', async () => {
      googleMock.events.update.mockRejectedValueOnce({ code: 404, message: 'Not Found' });

      const doctor = await createTestDoctor();
      const booking = await prisma.booking.create({
        data: { name: '404 Test', phone: '+966500000013', service: 'Surgery', date: '2026-08-13', time: '12:00', doctorId: doctor.id, source: 'dashboard', calendarEventId: 'deleted-event', calendarSynced: true },
      });

      const { updateCalendarEvent } = await import('@/app/lib/googleCalendar');
      await expect(updateCalendarEvent(booking, doctor)).rejects.toThrow();
    });
  });

  describe('deleteCalendarEvent', () => {
    it('should delete a calendar event', async () => {
      const doctor = await createTestDoctor();
      const { deleteCalendarEvent } = await import('@/app/lib/googleCalendar');
      await deleteCalendarEvent(doctor.calendarId, 'event-to-delete');

      expect(googleMock.events.delete).toHaveBeenCalledTimes(1);
    });

    it('should swallow 404 on delete (already deleted)', async () => {
      googleMock.events.delete.mockRejectedValueOnce({ code: 404, message: 'Not Found' });

      const { deleteCalendarEvent } = await import('@/app/lib/googleCalendar');
      await expect(deleteCalendarEvent('cal-id', 'gone-event')).resolves.not.toThrow();
    });
  });

  describe('syncBooking full flow', () => {
    it('should create event for unsynced booking (CASE 1)', async () => {
      const doctor = await createTestDoctor();
      const booking = await prisma.booking.create({
        data: { name: 'Sync Create', phone: '+966500000014', service: 'Consult', date: '2026-08-14', time: '13:00', doctorId: doctor.id, source: 'dashboard' },
      });

      const { syncBooking } = await import('@/app/lib/googleCalendar');
      const result = await syncBooking(booking, doctor);

      expect(result.action).toBe('created');
      expect(result.calendarEventId).toBeTruthy();
    });

    it('should update existing event (CASE 2)', async () => {
      const doctor = await createTestDoctor();
      const booking = await prisma.booking.create({
        data: { name: 'Sync Update', phone: '+966500000015', service: 'Checkup', date: '2026-08-15', time: '14:00', doctorId: doctor.id, source: 'dashboard', calendarEventId: 'existing-id', calendarSynced: true, calendarLastSyncedAt: new Date('2026-01-01') },
      });

      const { syncBooking } = await import('@/app/lib/googleCalendar');
      const result = await syncBooking(booking, doctor);

      expect(result.action).toBe('updated');
      expect(googleMock.events.update).toHaveBeenCalledTimes(1);
    });

    it('should delete event for cancelled booking (CASE 3)', async () => {
      const doctor = await createTestDoctor();
      const booking = await prisma.booking.create({
        data: { name: 'Cancel Sync', phone: '+966500000016', service: 'Dental', date: '2026-08-16', time: '15:00', doctorId: doctor.id, source: 'dashboard', status: 'cancelled' as any, calendarEventId: 'cancel-event-id', calendarSynced: true },
      });

      const { syncBooking } = await import('@/app/lib/googleCalendar');
      const result = await syncBooking(booking, doctor);

      expect(result.action).toBe('deleted');
      expect(googleMock.events.delete).toHaveBeenCalledTimes(1);

      const updated = await prisma.booking.findUnique({ where: { id: booking.id } });
      expect(updated!.calendarEventId).toBeNull();
      expect(updated!.calendarSynced).toBe(false);
    });

    it('should recreate event on 404 update (CASE 4)', async () => {
      googleMock.events.update.mockRejectedValueOnce({ code: 404, message: 'Not Found' });

      const doctor = await createTestDoctor();
      const booking = await prisma.booking.create({
        data: { name: 'Recreate', phone: '+966500000017', service: 'Therapy', date: '2026-08-17', time: '16:00', doctorId: doctor.id, source: 'dashboard', calendarEventId: 'dead-event', calendarSynced: true, calendarLastSyncedAt: new Date('2026-01-01') },
      });

      const { syncBooking } = await import('@/app/lib/googleCalendar');
      const result = await syncBooking(booking, doctor);

      expect(result.action).toBe('recreated');
      expect(googleMock.events.insert).toHaveBeenCalledTimes(1);
    });

    it('should skip already-synced unchanged booking', async () => {
      const doctor = await createTestDoctor();
      const booking = await prisma.booking.create({
        data: { name: 'Skip Test', phone: '+966500000018', service: 'Consult', date: '2026-08-18', time: '17:00', doctorId: doctor.id, source: 'dashboard', calendarEventId: 'synced-event', calendarSynced: true },
      });
      // Set calendarLastSyncedAt to match updatedAt so the skip check passes
      await prisma.$executeRaw`UPDATE "bookings" SET "calendarLastSyncedAt" = "updatedAt" WHERE "id" = ${booking.id}`;
      const updated = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });

      const { syncBooking } = await import('@/app/lib/googleCalendar');
      const result = await syncBooking(updated, doctor);

      expect(result.action).toBe('skipped');
    });

    it('should enqueue retry on transient failure (CASE 5)', async () => {
      googleMock.events.insert.mockRejectedValueOnce({ code: 503, message: 'Service Unavailable' });

      const doctor = await createTestDoctor();
      const booking = await prisma.booking.create({
        data: { name: 'Retry Test', phone: '+966500000019', service: 'Surgery', date: '2026-08-19', time: '08:00', doctorId: doctor.id, source: 'dashboard' },
      });

      const { syncBooking } = await import('@/app/lib/googleCalendar');
      const result = await syncBooking(booking, doctor);

      expect(result.action).toBe('failed');

      const jobs = await prisma.calendarSyncJob.findMany({ where: { bookingId: booking.id } });
      expect(jobs.length).toBeGreaterThanOrEqual(1);
      expect(jobs[0].status).toBe('pending');
    });
  });

  describe('incremental sync', () => {
    it('should skip when booking unchanged since last sync', async () => {
      const doctor = await createTestDoctor();
      const booking = await prisma.booking.create({
        data: { name: 'Incremental', phone: '+966500000020', service: 'Checkup', date: '2026-08-20', time: '09:00', doctorId: doctor.id, source: 'dashboard', calendarEventId: 'existing', calendarSynced: true },
      });
      await prisma.$executeRaw`UPDATE "bookings" SET "calendarLastSyncedAt" = "updatedAt" WHERE "id" = ${booking.id}`;
      const updated = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });

      const { syncBooking } = await import('@/app/lib/googleCalendar');
      const result = await syncBooking(updated, doctor);

      expect(result.action).toBe('skipped');
    });
  });
});
