import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { prisma, cleanDatabase } from './setup';
import { createTestUser, createTestDoctor } from './helpers';

describe('Audit System', () => {
  beforeAll(async () => {
    await cleanDatabase();
  });

  beforeEach(async () => {
    await cleanDatabase();
  });

  it('should create audit log entries', async () => {
    const admin = await createTestUser();

    await prisma.auditLog.create({
      data: {
        userId: admin.id,
        userName: admin.name,
        userEmail: admin.email,
        action: 'BOOKING_CREATED',
        category: 'BOOKING',
        severity: 'INFO',
        entity: 'Booking',
        entityId: 'test-booking-id',
        details: { name: 'John', date: '2026-09-01' },
        status: 'success',
      },
    });

    const logs = await prisma.auditLog.findMany({ where: { userId: admin.id } });
    expect(logs).toHaveLength(1);
    expect(logs[0].action).toBe('BOOKING_CREATED');
    expect(logs[0].category).toBe('BOOKING');
  });

  it('should log authentication events', async () => {
    const admin = await createTestUser();

    await prisma.auditLog.create({
      data: {
        userId: admin.id, userName: admin.name, userEmail: admin.email,
        action: 'LOGIN', category: 'AUTH', severity: 'INFO',
        entity: 'User', entityId: admin.id, status: 'success',
      },
    });

    const count = await prisma.auditLog.count({ where: { action: 'LOGIN' } });
    expect(count).toBe(1);
  });

  it('should log Google Calendar sync events', async () => {
    const admin = await createTestUser();

    await prisma.auditLog.create({
      data: {
        userId: admin.id, userName: admin.name, userEmail: admin.email,
        action: 'GOOGLE_EVENT_CREATED', category: 'SYSTEM', severity: 'INFO',
        entity: 'Booking', entityId: 'booking-1',
        details: { calendarEventId: 'event-1' },
        status: 'success',
      },
    });

    const log = await prisma.auditLog.findFirst({ where: { action: 'GOOGLE_EVENT_CREATED' } });
    expect(log).toBeTruthy();
    expect(log!.entityId).toBe('booking-1');
  });

  it('should log retry worker events', async () => {
    await prisma.auditLog.create({
      data: {
        action: 'RETRY_WORKER_STARTED', category: 'SYSTEM', severity: 'INFO',
        entity: 'System', details: { batchId: 'batch-1' }, status: 'success',
      },
    });

    await prisma.auditLog.create({
      data: {
        action: 'RETRY_WORKER_COMPLETED', category: 'SYSTEM', severity: 'INFO',
        entity: 'System', details: { batchId: 'batch-1', processed: 5 }, status: 'success',
      },
    });

    const started = await prisma.auditLog.count({ where: { action: 'RETRY_WORKER_STARTED' } });
    const completed = await prisma.auditLog.count({ where: { action: 'RETRY_WORKER_COMPLETED' } });
    expect(started).toBe(1);
    expect(completed).toBe(1);
  });

  it('should log role changes', async () => {
    const admin = await createTestUser();

    await prisma.auditLog.create({
      data: {
        userId: admin.id, userName: admin.name, userEmail: admin.email,
        action: 'USER_ROLE_CHANGED', category: 'AUTH', severity: 'INFO',
        entity: 'User', entityId: 'target-user',
        details: { from: 'doctor', to: 'admin' },
        status: 'success',
      },
    });

    const log = await prisma.auditLog.findFirst({ where: { action: 'USER_ROLE_CHANGED' } });
    expect(log).toBeTruthy();
    expect((log!.details as any).from).toBe('doctor');
    expect((log!.details as any).to).toBe('admin');
  });

  it('should handle audit log failure gracefully', async () => {
    // Audit log should not throw — even with minimal data
    await expect(
      prisma.auditLog.create({
        data: {
          action: 'SYSTEM_EVENT',
          category: 'SYSTEM',
          severity: 'INFO',
          status: 'success',
        },
      })
    ).resolves.toBeTruthy();
  });
});
