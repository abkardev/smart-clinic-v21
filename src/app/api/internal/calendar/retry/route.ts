export const dynamic = 'force-dynamic';
export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { getAuthUser, requireRole } from '@/app/lib/auth';
import { logAudit, auditOptsFromRequest, AuditAction, AuditOptions } from '@/app/lib/audit';
import { logger } from '@/app/lib/logger';
import os from 'os';

function getBatchSize(): number {
  const raw = process.env.CALENDAR_RETRY_BATCH_SIZE;
  if (!raw) return 10;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 10;
}

function getSecret(): string | null {
  return process.env.CALENDAR_INTERNAL_SECRET ?? null;
}

async function acquireLock(auditOpts?: AuditOptions): Promise<boolean> {
  const instance = `${os.hostname()}-${process.pid}`;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 5 * 60 * 1000);

  try {
    return await prisma.$transaction(async (tx) => {
      const existing = await tx.calendarRetryLock.findUnique({
        where: { id: 'singleton' },
      });

      if (!existing || existing.expiresAt < now) {
        await tx.calendarRetryLock.upsert({
          where: { id: 'singleton' },
          update: { lockedAt: now, expiresAt, instance },
          create: { id: 'singleton', lockedAt: now, expiresAt, instance },
        });
        if (auditOpts) {
          logAudit(AuditAction.RETRY_WORKER_LOCKED, 'System', null,
            { acquired: true, instance, expiresAt: expiresAt.toISOString() }, auditOpts
          ).catch(() => {});
        }
        return true;
      }

      return false;
    });
  } catch (err) {
    logger.warn('retry: lock acquisition failed', { error: String(err) });
    return false;
  }
}

async function releaseLock(): Promise<void> {
  try {
    await prisma.calendarRetryLock.delete({ where: { id: 'singleton' } });
  } catch {
    // already deleted or never existed
  }
}

async function recoverStuckJobs(auditOpts?: AuditOptions): Promise<number> {
  const cutoff = new Date(Date.now() - 10 * 60 * 1000);
  const result = await prisma.calendarSyncJob.updateMany({
    where: { status: 'processing', updatedAt: { lt: cutoff } },
    data: { status: 'pending' },
  });
  if (result.count > 0 && auditOpts) {
    logAudit(AuditAction.RETRY_WORKER_RECOVERED, 'System', null,
      { recovered: result.count, cutoff: cutoff.toISOString() }, auditOpts
    ).catch(() => {});
  }
  return result.count;
}

export async function POST(req: NextRequest) {
  const startedAt = Date.now();
  const batchId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let auditOpts: AuditOptions = {};
  let authMethod: 'secret' | 'role' | null = null;

  // Phase 2: Internal auth via CALENDAR_INTERNAL_SECRET
  const secret = getSecret();
  const authHeader = req.headers.get('authorization') ?? '';
  if (secret && authHeader.startsWith('Bearer ') && authHeader.slice(7) === secret) {
    authMethod = 'secret';
  } else {
    // Fall back to role-based auth (backward compatible)
    const { user, error } = await getAuthUser(req);
    if (error) return error;
    const roleError = requireRole(user!, 'superadmin', 'admin');
    if (roleError) return roleError;
    authMethod = 'role';
    auditOpts = auditOptsFromRequest(req, user!);
  }

  logger.info('retry worker started', { batchId, authMethod, correlationId: auditOpts.correlationId });
  await logAudit(AuditAction.RETRY_WORKER_STARTED, 'System', null,
    { batchId, authMethod }, auditOpts
  );

  try {
    // Phase 5: Distributed lock (non-blocking)
    const locked = await acquireLock(auditOpts);
    if (!locked) {
      return NextResponse.json(
        { message: 'Another retry worker is already running', locked: false },
        { status: 409 }
      );
    }

    let recovered = 0;
    try {
      // Phase 6: Crash recovery — rescue stuck processing jobs
      recovered = await recoverStuckJobs(auditOpts);

      // Phase 7: Configurable batch size
      const batchSize = getBatchSize();

      const jobs = await prisma.calendarSyncJob.findMany({
        where: { status: 'pending', nextRetryAt: { lte: new Date() } },
        take: batchSize,
        orderBy: { nextRetryAt: 'asc' },
      });

      if (jobs.length === 0) {
        return NextResponse.json({
          message: 'No pending retry jobs',
          processed: 0,
          recovered,
          locked: true,
        });
      }

      const { syncBooking, getNextRetryAt } = await import('@/app/lib/googleCalendar');
      const results: { jobId: string; bookingId: string; status: string }[] = [];

      const settled = await Promise.allSettled(
        jobs.map(async (job) => {
          const doctor = await prisma.doctor.findUnique({ where: { id: job.doctorId } });
          if (!doctor) {
            await prisma.calendarSyncJob.update({
              where: { id: job.id },
              data: { status: 'failed', error: 'Doctor not found' },
            });
            return { jobId: job.id, bookingId: job.bookingId, status: 'failed' };
          }

          const booking = await prisma.booking.findUnique({ where: { id: job.bookingId } });
          if (!booking) {
            await prisma.calendarSyncJob.update({
              where: { id: job.id },
              data: { status: 'failed', error: 'Booking not found' },
            });
            return { jobId: job.id, bookingId: job.bookingId, status: 'failed' };
          }

          await prisma.calendarSyncJob.update({
            where: { id: job.id },
            data: { status: 'processing' },
          });

          const result = await syncBooking(booking, doctor, {
            auditOpts,
            skipRetryEnqueue: true,
          });

          if (result.action === 'skipped' || result.action === 'created' ||
              result.action === 'updated' || result.action === 'recreated' ||
              result.action === 'deleted') {
            await prisma.calendarSyncJob.delete({ where: { id: job.id } });
            return { jobId: job.id, bookingId: job.bookingId, status: 'completed' };
          }

          const newAttempt = job.attempt + 1;
          if (newAttempt >= 5) {
            await prisma.calendarSyncJob.update({
              where: { id: job.id },
              data: { status: 'failed', error: result.error ?? 'Max attempts reached', attempt: newAttempt },
            });
            logAudit(AuditAction.GOOGLE_SYNC_FAILED, 'Booking', job.bookingId,
              { doctorId: job.doctorId, attempt: newAttempt, error: result.error }, auditOpts
            ).catch(() => {});
            return { jobId: job.id, bookingId: job.bookingId, status: 'failed' };
          }

          await prisma.calendarSyncJob.update({
            where: { id: job.id },
            data: {
              status: 'pending',
              attempt: newAttempt,
              error: result.error ?? null,
              nextRetryAt: getNextRetryAt(newAttempt),
            },
          });
          return { jobId: job.id, bookingId: job.bookingId, status: 'retrying' };
        })
      );

      for (const s of settled) {
        if (s.status === 'fulfilled') results.push(s.value);
        else logger.error('retry worker: unexpected job failure', { batchId, error: s.reason });
      }

      const completed = results.filter(r => r.status === 'completed').length;
      const failed = results.filter(r => r.status === 'failed').length;
      const retrying = results.filter(r => r.status === 'retrying').length;

      logger.info('retry worker completed', {
        batchId,
        processed: jobs.length,
        completed,
        failed,
        retrying,
        recovered,
        duration: Date.now() - startedAt,
        correlationId: auditOpts.correlationId,
      });

      await logAudit(AuditAction.RETRY_WORKER_COMPLETED, 'System', null,
        { batchId, processed: jobs.length, completed, failed, retrying, recovered,
          duration: Date.now() - startedAt }, auditOpts
      );

      return NextResponse.json({
        message: `Processed ${jobs.length} retry jobs`,
        processed: jobs.length,
        completed,
        failed,
        retrying,
        recovered,
        results,
      });
    } finally {
      await releaseLock();
    }
  } catch (err) {
    logger.error('retry worker failed', {
      batchId, error: String(err), duration: Date.now() - startedAt,
    });
    return NextResponse.json({ message: 'Server error' }, { status: 500 });
  }
}
