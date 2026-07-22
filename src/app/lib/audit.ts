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
  PASSWORD_RESET: 'PASSWORD_RESET',
  // Reminders
  REMINDER_SENT: 'REMINDER_SENT',
  // Google Calendar
  GOOGLE_SYNC_STARTED: 'GOOGLE_SYNC_STARTED',
  GOOGLE_EVENT_CREATED: 'GOOGLE_EVENT_CREATED',
  GOOGLE_EVENT_UPDATED: 'GOOGLE_EVENT_UPDATED',
  GOOGLE_EVENT_DELETED: 'GOOGLE_EVENT_DELETED',
  GOOGLE_EVENT_RECREATED: 'GOOGLE_EVENT_RECREATED',
  GOOGLE_SYNC_COMPLETED: 'GOOGLE_SYNC_COMPLETED',
  GOOGLE_SYNC_FAILED: 'GOOGLE_SYNC_FAILED',
  GOOGLE_SYNC_RETRY: 'GOOGLE_SYNC_RETRY',
  RETRY_WORKER_STARTED: 'RETRY_WORKER_STARTED',
  RETRY_WORKER_COMPLETED: 'RETRY_WORKER_COMPLETED',
  RETRY_WORKER_LOCKED: 'RETRY_WORKER_LOCKED',
  RETRY_WORKER_RECOVERED: 'RETRY_WORKER_RECOVERED',
  // Google Calendar Channels
  GOOGLE_CHANNEL_CREATED: 'GOOGLE_CHANNEL_CREATED',
  GOOGLE_CHANNEL_RENEWED: 'GOOGLE_CHANNEL_RENEWED',
  GOOGLE_CHANNEL_STOPPED: 'GOOGLE_CHANNEL_STOPPED',
  GOOGLE_SYNC_TOKEN_UPDATED: 'GOOGLE_SYNC_TOKEN_UPDATED',
  GOOGLE_WEBHOOK_RECEIVED: 'GOOGLE_WEBHOOK_RECEIVED',
  GOOGLE_WEBHOOK_PROCESSED: 'GOOGLE_WEBHOOK_PROCESSED',
  GOOGLE_CONFLICT_DETECTED: 'GOOGLE_CONFLICT_DETECTED',
  GOOGLE_BUSY_IMPORTED: 'GOOGLE_BUSY_IMPORTED',
  GOOGLE_OAUTH_CONNECTED: 'GOOGLE_OAUTH_CONNECTED',
  GOOGLE_OAUTH_DISCONNECTED: 'GOOGLE_OAUTH_DISCONNECTED',
  GOOGLE_OAUTH_EXPIRED: 'GOOGLE_OAUTH_EXPIRED',
  GOOGLE_OAUTH_REFRESHED: 'GOOGLE_OAUTH_REFRESHED',
  GOOGLE_MEET_CREATED: 'GOOGLE_MEET_CREATED',
  RECURRING_SLOT_CREATED: 'RECURRING_SLOT_CREATED',
  RECURRING_SLOT_DELETED: 'RECURRING_SLOT_DELETED',
  DRIFT_DETECTED: 'DRIFT_DETECTED',
  CONFIG_UPDATED: 'CONFIG_UPDATED',
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
  PASSWORD_RESET: AuditCategory.AUTH,
  SETTINGS_CHANGED: AuditCategory.SETTINGS,
  SYSTEM_EVENT: AuditCategory.SYSTEM,
  REMINDER_SENT: AuditCategory.BOOKING,
  GOOGLE_SYNC_STARTED: AuditCategory.SYSTEM,
  GOOGLE_EVENT_CREATED: AuditCategory.SYSTEM,
  GOOGLE_EVENT_UPDATED: AuditCategory.SYSTEM,
  GOOGLE_EVENT_DELETED: AuditCategory.SYSTEM,
  GOOGLE_EVENT_RECREATED: AuditCategory.SYSTEM,
  GOOGLE_SYNC_COMPLETED: AuditCategory.SYSTEM,
  GOOGLE_SYNC_RETRY: AuditCategory.SYSTEM,
  GOOGLE_SYNC_FAILED: AuditCategory.SYSTEM,
  RETRY_WORKER_STARTED: AuditCategory.SYSTEM,
  RETRY_WORKER_COMPLETED: AuditCategory.SYSTEM,
  RETRY_WORKER_LOCKED: AuditCategory.SYSTEM,
  RETRY_WORKER_RECOVERED: AuditCategory.SYSTEM,
  GOOGLE_CHANNEL_CREATED: AuditCategory.SYSTEM,
  GOOGLE_CHANNEL_RENEWED: AuditCategory.SYSTEM,
  GOOGLE_CHANNEL_STOPPED: AuditCategory.SYSTEM,
  GOOGLE_SYNC_TOKEN_UPDATED: AuditCategory.SYSTEM,
  GOOGLE_WEBHOOK_RECEIVED: AuditCategory.SYSTEM,
  GOOGLE_WEBHOOK_PROCESSED: AuditCategory.SYSTEM,
  GOOGLE_CONFLICT_DETECTED: AuditCategory.SYSTEM,
  GOOGLE_BUSY_IMPORTED: AuditCategory.SYSTEM,
  GOOGLE_OAUTH_CONNECTED: AuditCategory.DOCTOR,
  GOOGLE_OAUTH_DISCONNECTED: AuditCategory.DOCTOR,
  GOOGLE_OAUTH_EXPIRED: AuditCategory.DOCTOR,
  GOOGLE_OAUTH_REFRESHED: AuditCategory.DOCTOR,
  GOOGLE_MEET_CREATED: AuditCategory.SYSTEM,
  RECURRING_SLOT_CREATED: AuditCategory.SETTINGS,
  RECURRING_SLOT_DELETED: AuditCategory.SETTINGS,
  DRIFT_DETECTED: AuditCategory.SYSTEM,
  CONFIG_UPDATED: AuditCategory.SETTINGS,
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
