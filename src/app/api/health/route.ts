export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
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

async function checkDatabase(): Promise<CheckResult> {
  const start = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { status: 'healthy', latencyMs: Date.now() - start };
  } catch (err) {
    return { status: 'unhealthy', latencyMs: Date.now() - start, message: (err as Error).message };
  }
}

function checkEnvVar(name: string, required: boolean): { present: boolean; name: string } {
  return { name, present: !!process.env[name] && !process.env[name]?.startsWith('your_') };
}

function checkEnvironment(): { status: CheckStatus; missing: string[]; degraded: string[] } {
  const required = [
    'DATABASE_URL',
    'JWT_SECRET',
  ];
  const optional = [
    'BLOB_READ_WRITE_TOKEN',
    'WHATSAPP_TOKEN',
    'WHATSAPP_PHONE_ID',
    'WHATSAPP_VERIFY_TOKEN',
    'INSTAGRAM_TOKEN',
    'INSTAGRAM_VERIFY_TOKEN',
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
    'GOOGLE_REFRESH_TOKEN',
    'NEXT_PUBLIC_APP_URL',
  ];

  const missing: string[] = [];
  const degraded: string[] = [];

  for (const name of required) {
    const r = checkEnvVar(name, true);
    if (!r.present) missing.push(name);
  }
  for (const name of optional) {
    const r = checkEnvVar(name, false);
    if (!r.present) degraded.push(name);
  }

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

function checkBlobStorage(): CheckResult {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) return { status: 'degraded', message: 'BLOB_READ_WRITE_TOKEN not set, falling back to local disk' };
  return { status: 'healthy' };
}

export async function GET(req: NextRequest) {
  try {
    const start = Date.now();

    const [db, env, wa, ig, gcal, blob] = await Promise.all([
      checkDatabase(),
      Promise.resolve(checkEnvironment()),
      Promise.resolve(checkWhatsApp()),
      Promise.resolve(checkInstagram()),
      Promise.resolve(checkGoogleCalendar()),
      Promise.resolve(checkBlobStorage()),
    ]);

    const checks = {
      database: db,
      environment: env,
      whatsApp: wa,
      instagram: ig,
      googleCalendar: gcal,
      blobStorage: blob,
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

    const statusCode = overall === 'unhealthy' ? 503 : overall === 'degraded' ? 200 : 200;
    return NextResponse.json(response, { status: statusCode });
  } catch (err) {
    return NextResponse.json(
      {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: 'health check crashed',
        detail: (err as Error).message,
      },
      { status: 503 }
    );
  }
}
