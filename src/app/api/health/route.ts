export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { logger } from '@/app/lib/logger';
import pkg from '../../../../package.json';

const START_TIME = Date.now();
const COMMIT_SHA = process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA || process.env.VERCEL_GIT_COMMIT_SHA || null;
const DEPLOYED_AT = process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_AT ? new Date(process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_AT).toISOString() : null;
const NODE_VERSION = process.version;
const PRISMA_CLIENT_VERSION = require('@prisma/client/package.json').version;
const ENVIRONMENT = process.env.NODE_ENV || 'development';

type CheckStatus = 'healthy' | 'degraded' | 'unhealthy';
interface CheckResult {
  status: CheckStatus;
  latencyMs?: number;
  message?: string;
}

const BACKLOG_THRESHOLD_MINUTES = 60;
const FAILED_JOBS_THRESHOLD = 50;
const EXPIRED_CHANNEL_THRESHOLD = 5;
const EXPIRED_TOKEN_THRESHOLD = 3;

async function checkDatabase(): Promise<CheckResult> {
  const start = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { status: 'healthy', latencyMs: Date.now() - start };
  } catch (err) {
    logger.error('Health check — database query failed', { error: String(err) });
    return { status: 'unhealthy', latencyMs: Date.now() - start, message: 'Database unavailable' };
  }
}

function checkEnvVar(name: string): { present: boolean } {
  return { present: !!process.env[name] && !process.env[name]?.startsWith('your_') };
}

function checkEnvironment(): { status: CheckStatus; missing: string[]; degraded: string[] } {
  const required = ['DATABASE_URL', 'JWT_SECRET'];
  const optional = [
    'BLOB_READ_WRITE_TOKEN', 'WHATSAPP_TOKEN', 'WHATSAPP_PHONE_ID',
    'WHATSAPP_VERIFY_TOKEN', 'INSTAGRAM_TOKEN', 'INSTAGRAM_VERIFY_TOKEN',
    'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REFRESH_TOKEN',
    'NEXT_PUBLIC_APP_URL',
  ];

  const missing = required.filter(n => !checkEnvVar(n).present);
  const degraded = optional.filter(n => !checkEnvVar(n).present);

  const status: CheckStatus = missing.length > 0 ? 'unhealthy' : degraded.length > 0 ? 'degraded' : 'healthy';
  return { status, missing, degraded };
}

function checkWhatsApp(): CheckResult {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_ID;
  if (!token || !phoneId) return { status: 'degraded', message: 'WHATSAPP_TOKEN or WHATSAPP_PHONE_ID not set' };
  if (token.includes('EAAN4')) return { status: 'degraded', message: 'WHATSAPP_TOKEN appears to be a development token' };
  return { status: 'healthy' };
}

function checkInstagram(): CheckResult {
  const token = process.env.INSTAGRAM_TOKEN;
  if (!token) return { status: 'degraded', message: 'INSTAGRAM_TOKEN not set' };
  if (token === 'your_instagram_page_access_token') return { status: 'degraded', message: 'INSTAGRAM_TOKEN not configured' };
  return { status: 'healthy' };
}

function checkGoogleCalendar(): CheckResult {
  const id = process.env.GOOGLE_CLIENT_ID;
  const secret = process.env.GOOGLE_CLIENT_SECRET;
  const refresh = process.env.GOOGLE_REFRESH_TOKEN;
  if (!id || !secret || !refresh) return { status: 'degraded', message: 'Google Calendar credentials incomplete' };
  if (id === 'your_google_client_id') return { status: 'degraded', message: 'Google Calendar not configured' };
  return { status: 'healthy' };
}

async function checkCalendarRetry(): Promise<CheckResult & {
  enabled: boolean;
  pendingJobs: number;
  failedJobs: number;
  processingJobs: number;
  oldestPendingMinutes: number | null;
  schedulerHealthy: boolean;
}> {
  const enabled = process.env.CALENDAR_RETRY_ENABLED === 'true';
  if (!enabled) {
    return { status: 'healthy' as CheckStatus, enabled: false, pendingJobs: 0, failedJobs: 0, processingJobs: 0, oldestPendingMinutes: null, schedulerHealthy: false };
  }

  const [pendingJobs, failedJobs, processingJobs, oldestPending] = await Promise.all([
    prisma.calendarSyncJob.count({ where: { status: 'pending' } }),
    prisma.calendarSyncJob.count({ where: { status: 'failed' } }),
    prisma.calendarSyncJob.count({ where: { status: 'processing' } }),
    prisma.calendarSyncJob.findFirst({
      where: { status: 'pending' },
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true },
    }),
  ]);

  const oldestPendingMinutes = oldestPending
    ? Math.round((Date.now() - oldestPending.createdAt.getTime()) / 60000)
    : null;

  const schedulerHealthy = processingJobs === 0;
  const hasBacklog = oldestPendingMinutes !== null && oldestPendingMinutes > BACKLOG_THRESHOLD_MINUTES;
  const hasTooManyFailed = failedJobs > FAILED_JOBS_THRESHOLD;

  let status: CheckStatus = 'healthy';
  if (hasBacklog || hasTooManyFailed) status = 'degraded';
  if (processingJobs > 5) status = 'unhealthy';

  return { status, enabled, pendingJobs, failedJobs, processingJobs, oldestPendingMinutes, schedulerHealthy };
}

async function checkCalendarChannels(): Promise<CheckResult & {
  activeChannels?: number;
  expiringChannels?: number;
  expiredChannels?: number;
  erroredChannels?: number;
  channelHealth?: string;
}> {
  try {
    const { getChannelHealth } = await import('@/app/lib/channelScheduler');
    const health = await getChannelHealth();

    let status: CheckStatus = 'healthy';
    if (health.expired > EXPIRED_CHANNEL_THRESHOLD) status = 'degraded';
    if (health.errored > EXPIRED_CHANNEL_THRESHOLD) status = 'degraded';

    return {
      status,
      activeChannels: health.active,
      expiringChannels: health.expiring,
      expiredChannels: health.expired,
      erroredChannels: health.errored,
      channelHealth: health.total === 0 ? 'no_channels' : status,
    };
  } catch {
    return { status: 'degraded', message: 'Unable to query channel health' };
  }
}

async function checkOAuthTokens(): Promise<CheckResult & {
  active: number;
  expiring: number;
  expired: number;
  revoked: number;
  total: number;
}> {
  try {
    const { getTokenHealth } = await import('@/app/lib/oauthLifecycle');
    const health = await getTokenHealth();

    let status: CheckStatus = 'healthy';
    if (health.expired > EXPIRED_TOKEN_THRESHOLD) status = 'degraded';
    if (health.revoked > 0) status = 'degraded';

    return { status, ...health };
  } catch {
    return { status: 'degraded', active: 0, expiring: 0, expired: 0, revoked: 0, total: 0 };
  }
}

async function checkSyncBacklog(): Promise<CheckResult & {
  syncedBookings: number;
  unsyncedBookings: number;
  syncRatio: number;
  doctorsWithBacklog: number;
}> {
  try {
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const recentBookings = await prisma.booking.findMany({
      where: {
        date: { gte: oneWeekAgo, lte: today },
        status: { not: 'cancelled' },
      },
      select: { calendarSynced: true, doctorId: true },
    });

    const synced = recentBookings.filter((b) => b.calendarSynced).length;
    const unsynced = recentBookings.length - synced;
    const syncRatio = recentBookings.length > 0 ? synced / recentBookings.length : 1;

    const doctorsWithBacklog = new Set(
      recentBookings.filter((b) => !b.calendarSynced).map((b) => b.doctorId)
    ).size;

    let status: CheckStatus = 'healthy';
    if (syncRatio < 0.9) status = 'degraded';
    if (syncRatio < 0.7) status = 'unhealthy';

    return { status, syncedBookings: synced, unsyncedBookings: unsynced, syncRatio: Math.round(syncRatio * 100) / 100, doctorsWithBacklog };
  } catch {
    return { status: 'degraded', syncedBookings: 0, unsyncedBookings: 0, syncRatio: 0, doctorsWithBacklog: 0 };
  }
}

function checkBlobStorage(): CheckResult {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) return { status: 'degraded', message: 'BLOB_READ_WRITE_TOKEN not set, falling back to local disk' };
  return { status: 'healthy' };
}

export async function GET(req: NextRequest) {
  try {
    const start = Date.now();
    const checkParam = req.nextUrl.searchParams.get('check');

    if (checkParam === 'liveness') {
      return NextResponse.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptimeSeconds: Math.floor((Date.now() - START_TIME) / 1000),
      });
    }

    if (checkParam === 'startup') {
      const db = await checkDatabase();
      const status = db.status === 'healthy' ? 'healthy' : 'unhealthy';
      return NextResponse.json({ status, timestamp: new Date().toISOString(), database: db });
    }

    if (checkParam === 'readiness') {
      const [db, env] = await Promise.all([
        checkDatabase(),
        Promise.resolve(checkEnvironment()),
      ]);
      const hasUnhealthy = db.status === 'unhealthy' || env.status === 'unhealthy';
      const status = hasUnhealthy ? 'unhealthy' : 'healthy';
      return NextResponse.json(
        { status, timestamp: new Date().toISOString(), checks: { database: db, environment: env } },
        { status: status === 'unhealthy' ? 503 : 200 }
      );
    }

    if (checkParam === 'google-calendar') {
      const [gcal, channels, tokens, retry, sync] = await Promise.all([
        Promise.resolve(checkGoogleCalendar()),
        checkCalendarChannels(),
        checkOAuthTokens(),
        checkCalendarRetry(),
        checkSyncBacklog(),
      ]);
      return NextResponse.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        checks: { googleCalendar: gcal, channels, tokens, retry, sync },
      });
    }

    const [db, env, wa, ig, gcal, blob, calendarRetry, channels, tokens, sync] = await Promise.all([
      checkDatabase(),
      Promise.resolve(checkEnvironment()),
      Promise.resolve(checkWhatsApp()),
      Promise.resolve(checkInstagram()),
      Promise.resolve(checkGoogleCalendar()),
      Promise.resolve(checkBlobStorage()),
      checkCalendarRetry(),
      checkCalendarChannels(),
      checkOAuthTokens(),
      checkSyncBacklog(),
    ]);

    const checks = {
      database: db,
      environment: env,
      whatsApp: wa,
      instagram: ig,
      googleCalendar: gcal,
      blobStorage: blob,
      calendarRetry,
      calendarChannels: channels,
      oAuthTokens: tokens,
      syncBacklog: sync,
    };

    const entries = Object.values(checks);
    const hasUnhealthy = entries.some(c => c.status === 'unhealthy');
    const hasDegraded = entries.some(c => c.status === 'degraded');
    const overall: CheckStatus = hasUnhealthy ? 'unhealthy' : hasDegraded ? 'degraded' : 'healthy';

    const response = {
      status: overall,
      timestamp: new Date().toISOString(),
      latencyMs: Date.now() - start,
      uptimeSeconds: Math.floor((Date.now() - START_TIME) / 1000),
      environment: ENVIRONMENT,
      version: {
        build: pkg.version,
        node: NODE_VERSION,
        prismaClient: PRISMA_CLIENT_VERSION,
        commit: COMMIT_SHA,
        deployedAt: DEPLOYED_AT,
      },
      checks,
    };

    const statusCode = overall === 'unhealthy' ? 503 : 200;
    return NextResponse.json(response, { status: statusCode });
  } catch (err) {
    logger.error('Health check — unexpected error', { error: String(err) });
    return NextResponse.json(
      { status: 'unhealthy', timestamp: new Date().toISOString(), error: 'health check crashed' },
      { status: 503 }
    );
  }
}
