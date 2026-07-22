import { PrismaClient } from '@prisma/client';
import { required } from './env';
import { logger } from './logger';

const REQUIRED_STARTUP_VARS = ['DATABASE_URL', 'JWT_SECRET'];
const missingCfg: string[] = [];
for (const name of REQUIRED_STARTUP_VARS) {
  const val = process.env[name];
  if (!val || val.startsWith('your_')) missingCfg.push(name);
}
if (missingCfg.length > 0) {
  const msg =
    `\n  Startup failed — missing required environment variable(s):\n` +
    missingCfg.map((n) => `    • ${n}`).join('\n') +
    `\n\n  Set them in your .env.local or deployment environment variables.\n`;
  logger.error('Startup configuration error', { message: msg });
  throw new Error(`Missing required environment variables: ${missingCfg.join(', ')}`);
}

const PRISMA_CLIENT_VERSION = require('@prisma/client/package.json').version;
logger.info('Prisma client initialized', {
  node: process.version,
  platform: `${process.platform} (${process.arch})`,
  prismaVersion: PRISMA_CLIENT_VERSION,
  env: process.env.NODE_ENV || 'development',
});

required('DATABASE_URL');

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

// ─── Connection pool exhaustion guard ────────────────────────────────────────
// If DATABASE_URL points at a non-pooled serverless Postgres endpoint (e.g.
// Neon's direct host without "-pooler"), the connection limit is very low
// and Next.js dev mode's parallel route compilation can exhaust it within
// seconds, surfacing as: "Timed out fetching a new connection from the
// connection pool". This isn't fixable from inside the Prisma client config
// — it requires the connection string itself to use the pooled endpoint
// (see .env.example). This check just makes the failure mode obvious in
// the server log instead of a bare stack trace.
if (process.env.NODE_ENV !== 'production') {
  const url = process.env.DATABASE_URL ?? '';
  const looksLikeNeon = url.includes('neon.tech');
  const looksPooled   = url.includes('-pooler');
  if (looksLikeNeon && !looksPooled) {
    logger.warn(
      'DATABASE_URL appears to be a Neon DIRECT connection (no "-pooler" in the hostname). ' +
      'This will exhaust its small connection limit under `next dev`. ' +
      'Use the "Pooled connection" string from your Neon dashboard instead.'
    );
  }
}

// ─── Startup configuration validation ─────────────────────────────────────────
import('./config').then(({ validateConfigOrThrow }) => validateConfigOrThrow());
