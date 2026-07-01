// Simple in-memory rate limiter. NOT suitable for multi-instance deployments
// (e.g. multiple Vercel workers) — for that, use Redis or the DB instead.

const store = new Map<string, { count: number; resetAt: number }>();

// Cleanup stale entries every 5 minutes
const CLEANUP_INTERVAL = 5 * 60 * 1000;
let lastCleanup = Date.now();

function cleanup() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  lastCleanup = now;
  for (const [key, val] of store) {
    if (val.resetAt < now) store.delete(key);
  }
}

export function checkRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number
): { allowed: boolean; remaining: number; resetAt: number } {
  cleanup();
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || entry.resetAt < now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: maxRequests - 1, resetAt: now + windowMs };
  }

  entry.count++;
  if (entry.count > maxRequests) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt };
  }

  return { allowed: true, remaining: maxRequests - entry.count, resetAt: entry.resetAt };
}
