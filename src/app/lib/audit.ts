import { Prisma, AuditStatus } from '@prisma/client';
import { prisma } from './prisma';
import { logger } from './logger';

// ─── Strongly typed enums ─────────────────────────────────────────────────────

export const AuditAction = {
  // Auth
  LOGIN: 'LOGIN',
  LOGOUT: 'LOGOUT',
  USER_CREATED: 'USER_CREATED',
  USER_UPDATED: 'USER_UPDATED',
  USER_DELETED: 'USER_DELETED',
  USER_STATUS_CHANGED: 'USER_STATUS_CHANGED',
  USER_ROLE_CHANGED: 'USER_ROLE_CHANGED',
  // Booking
  BOOKING_CREATED: 'BOOKING_CREATED',
  BOOKING_UPDATED: 'BOOKING_UPDATED',
  BOOKING_CANCELLED: 'BOOKING_CANCELLED',
  BOOKING_CONFIRMED: 'BOOKING_CONFIRMED',
  BOOKING_DRAGGED: 'BOOKING_DRAGGED',
  BOOKING_DELETED: 'BOOKING_DELETED',
  // Doctor
  DOCTOR_CREATED: 'DOCTOR_CREATED',
  DOCTOR_UPDATED: 'DOCTOR_UPDATED',
  DOCTOR_DEACTIVATED: 'DOCTOR_DEACTIVATED',
  // Patient
  PATIENT_CREATED: 'PATIENT_CREATED',
  PATIENT_UPDATED: 'PATIENT_UPDATED',
  // Offers
  OFFER_CREATED: 'OFFER_CREATED',
  OFFER_UPDATED: 'OFFER_UPDATED',
  OFFER_DELETED: 'OFFER_DELETED',
  // Slots
  SLOT_BLOCKED: 'SLOT_BLOCKED',
  SLOT_UNBLOCKED: 'SLOT_UNBLOCKED',
  // Holiday
  HOLIDAY_CREATED: 'HOLIDAY_CREATED',
  HOLIDAY_DELETED: 'HOLIDAY_DELETED',
  // System
  SETTINGS_CHANGED: 'SETTINGS_CHANGED',
  SYSTEM_EVENT: 'SYSTEM_EVENT',
  // Security
  LOGIN_FAILED: 'LOGIN_FAILED',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
} as const;

export type AuditAction = (typeof AuditAction)[keyof typeof AuditAction];

export const AuditCategory = {
  AUTH: 'AUTH',
  BOOKING: 'BOOKING',
  PATIENT: 'PATIENT',
  DOCTOR: 'DOCTOR',
  SYSTEM: 'SYSTEM',
  SETTINGS: 'SETTINGS',
  OFFERS: 'OFFERS',
  SECURITY: 'SECURITY',
} as const;

export type AuditCategory = (typeof AuditCategory)[keyof typeof AuditCategory];

export const AuditSeverity = {
  INFO: 'INFO',
  WARNING: 'WARNING',
  ERROR: 'ERROR',
  CRITICAL: 'CRITICAL',
} as const;

export type AuditSeverity = (typeof AuditSeverity)[keyof typeof AuditSeverity];

// ─── Action → Category mapping ────────────────────────────────────────────────

const ACTION_CATEGORY: Record<string, AuditCategory> = {
  LOGIN: AuditCategory.AUTH,
  LOGOUT: AuditCategory.AUTH,
  LOGIN_FAILED: AuditCategory.SECURITY,
  PERMISSION_DENIED: AuditCategory.SECURITY,
  USER_CREATED: AuditCategory.AUTH,
  USER_UPDATED: AuditCategory.AUTH,
  USER_DELETED: AuditCategory.AUTH,
  USER_STATUS_CHANGED: AuditCategory.AUTH,
  USER_ROLE_CHANGED: AuditCategory.AUTH,
  BOOKING_CREATED: AuditCategory.BOOKING,
  BOOKING_UPDATED: AuditCategory.BOOKING,
  BOOKING_CANCELLED: AuditCategory.BOOKING,
  BOOKING_CONFIRMED: AuditCategory.BOOKING,
  BOOKING_DRAGGED: AuditCategory.BOOKING,
  BOOKING_DELETED: AuditCategory.BOOKING,
  DOCTOR_CREATED: AuditCategory.DOCTOR,
  DOCTOR_UPDATED: AuditCategory.DOCTOR,
  DOCTOR_DEACTIVATED: AuditCategory.DOCTOR,
  PATIENT_CREATED: AuditCategory.PATIENT,
  PATIENT_UPDATED: AuditCategory.PATIENT,
  OFFER_CREATED: AuditCategory.OFFERS,
  OFFER_UPDATED: AuditCategory.OFFERS,
  OFFER_DELETED: AuditCategory.OFFERS,
  SLOT_BLOCKED: AuditCategory.BOOKING,
  SLOT_UNBLOCKED: AuditCategory.BOOKING,
  HOLIDAY_CREATED: AuditCategory.SETTINGS,
  HOLIDAY_DELETED: AuditCategory.SETTINGS,
  SETTINGS_CHANGED: AuditCategory.SETTINGS,
  SYSTEM_EVENT: AuditCategory.SYSTEM,
};

function inferCategory(action: string): AuditCategory | null {
  return ACTION_CATEGORY[action] ?? null;
}

function inferSeverity(status: AuditStatus): AuditSeverity {
  return status === AuditStatus.failure ? AuditSeverity.ERROR : AuditSeverity.INFO;
}

// ─── AuditOptions ─────────────────────────────────────────────────────────────

export interface AuditOptions {
  userId?: string;
  userName?: string;
  userEmail?: string;
  ip?: string;
  userAgent?: string;
  correlationId?: string;
  bookingId?: string;
}

// ─── Sensitive data patterns (automatically redacted from details) ────────────

const SENSITIVE_KEYS = new Set([
  'password', 'token', 'secret', 'authorization', 'cookie', 'jwt',
  'refreshToken', 'accessToken', 'imageBase64',
]);

function sanitizeDetails(
  details: Record<string, unknown> | null
): Record<string, unknown> | null {
  if (!details) return null;
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(details)) {
    if (SENSITIVE_KEYS.has(key)) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'string' && value.length > 2000) {
      sanitized[key] = value.slice(0, 2000) + '... [truncated]';
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeDetails(value as Record<string, unknown>);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

// ─── Before/After diff helper ─────────────────────────────────────────────────

export interface FieldChange {
  before: unknown;
  after: unknown;
}

export type ChangeDiff = Record<string, FieldChange>;

export function computeDiff<T extends Record<string, unknown>>(
  before: T | null | undefined,
  after: T | null | undefined,
  fields: (keyof T)[]
): ChangeDiff {
  const changes: ChangeDiff = {};
  if (!before || !after) return changes;
  for (const field of fields) {
    if (before[field] !== after[field]) {
      changes[field as string] = { before: before[field], after: after[field] };
    }
  }
  return changes;
}

// ─── Retention utility (no auto-deletion) ────────────────────────────────────

export interface RetentionConfig {
  retentionDays: number;
}

export async function countExpiredLogs(config: RetentionConfig): Promise<number> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - config.retentionDays);

  const result = await prisma.auditLog.count({
    where: { createdAt: { lt: cutoff } },
  });
  return result;
}

export async function archiveExpiredLogs(
  config: RetentionConfig,
  archiveFn: (logs: unknown[]) => Promise<void>
): Promise<number> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - config.retentionDays);

  let total = 0;
  let batch: unknown[] = [];

  const cursor = prisma.auditLog.findMany({
    where: { createdAt: { lt: cutoff } },
    orderBy: { createdAt: 'asc' },
    take: 500,
  });

  let logs = await cursor;
  while (logs.length > 0) {
    batch = batch.concat(logs);
    if (batch.length >= 500) {
      await archiveFn(batch);
      total += batch.length;
      batch = [];
    }
    logs = await prisma.auditLog.findMany({
      where: { createdAt: { lt: cutoff } },
      orderBy: { createdAt: 'asc' },
      take: 500,
      skip: total + logs.length,
    });
  }

  if (batch.length > 0) {
    await archiveFn(batch);
    total += batch.length;
  }

  return total;
}

// ─── Main logAudit function (backward compatible) ─────────────────────────────

export async function logAudit(
  action: string,
  entity: string | null,
  entityId: string | null,
  details: Record<string, unknown> | null,
  opts: AuditOptions = {},
  status: AuditStatus = AuditStatus.success,
  severityOverride?: AuditSeverity,
): Promise<void> {
  const sanitized = sanitizeDetails(details);
  const category = inferCategory(action);
  const severity = severityOverride ?? inferSeverity(status);

  try {
    await prisma.auditLog.create({
      data: {
        userId:    opts.userId    ?? null,
        userName:  opts.userName  ?? null,
        userEmail: opts.userEmail ?? null,
        action,
        category,
        severity,
        entity:    entity    ?? null,
        entityId:  entityId  ?? null,
        details: sanitized !== null
          ? (sanitized as unknown as Prisma.InputJsonValue)
          : Prisma.DbNull,
        ip:        opts.ip        ?? null,
        userAgent: opts.userAgent ?? null,
        status,
        correlationId: opts.correlationId ?? null,
        bookingId:     opts.bookingId     ?? null,
      },
    });
  } catch (err) {
    logger.error('Audit log error', { error: String(err) });
  }
}

// ─── auditOptsFromRequest (unchanged with added correlationId support) ─────────

export function auditOptsFromRequest(
  req: Request,
  user?: { id: string; name: string; email: string }
): AuditOptions {
  return {
    userId:    user?.id,
    userName:  user?.name,
    userEmail: user?.email,
    ip:        req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? undefined,
    userAgent: req.headers.get('user-agent') ?? undefined,
  };
}

// ─── Backward-compatible re-exports ───────────────────────────────────────────

export { AuditStatus } from '@prisma/client';
