import { PrismaClient } from '@prisma/client';

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
    console.warn(
      '\n⚠️  DATABASE_URL appears to be a Neon DIRECT connection (no "-pooler" in the hostname).\n' +
      '   This will exhaust its small connection limit almost immediately under `next dev`.\n' +
      '   Fix: copy the "Pooled connection" string from your Neon dashboard instead.\n' +
      '   See .env.example for details.\n'
    );
  }
}
