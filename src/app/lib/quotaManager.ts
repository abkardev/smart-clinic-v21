import { logger } from './logger';

interface QuotaConfig {
  requestsPerSecond: number;
  requestsPerDay: number;
  burstLimit: number;
  alertThreshold: number;
}

interface QuotaBucket {
  tokens: number;
  lastRefill: number;
}

interface RateLimitState {
  windowStart: number;
  requestCount: number;
}

interface DailyCounter {
  date: string;
  count: number;
}

const QUOTA_CONFIG: QuotaConfig = {
  requestsPerSecond: parseInt(process.env.GOOGLE_RATE_LIMIT_RPS ?? '10', 10),
  requestsPerDay: parseInt(process.env.GOOGLE_DAILY_QUOTA ?? '1000000', 10),
  burstLimit: parseInt(process.env.GOOGLE_BURST_LIMIT ?? '20', 10),
  alertThreshold: parseInt(process.env.GOOGLE_QUOTA_ALERT_AT ?? '0.8', 10),
};

const buckets = new Map<string, QuotaBucket>();
const rateLimitWindows = new Map<string, RateLimitState>();
let dailyCounters: DailyCounter[] = [];
let quotaExceededAlertSent = false;

function getCurrentDate(): string {
  return new Date().toISOString().split('T')[0];
}

function getDailyCount(): number {
  const today = getCurrentDate();
  const entry = dailyCounters.find((c) => c.date === today);
  return entry?.count ?? 0;
}

function incrementDailyCount(): void {
  const today = getCurrentDate();
  const entry = dailyCounters.find((c) => c.date === today);
  if (entry) {
    entry.count++;
  } else {
    dailyCounters.push({ date: today, count: 1 });
  }
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 7);
  const cutoffStr = cutoff.toISOString().split('T')[0];
  dailyCounters = dailyCounters.filter((c) => c.date >= cutoffStr);
}

function getSecondsUntilMidnight(): number {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setDate(midnight.getDate() + 1);
  midnight.setHours(0, 0, 0, 0);
  return Math.ceil((midnight.getTime() - now.getTime()) / 1000);
}

export function jitter(delayMs: number): number {
  const jitterFactor = 0.5 + Math.random() * 0.5;
  return Math.round(delayMs * jitterFactor);
}

export async function exponentialBackoff(
  attempt: number,
  baseMs: number = 1000,
  maxMs: number = 60000,
): Promise<void> {
  const delay = Math.min(baseMs * Math.pow(2, attempt - 1), maxMs);
  const jittered = jitter(delay);
  await new Promise((resolve) => setTimeout(resolve, jittered));
}

export function getRetryDelayFromHeaders(headers: Record<string, string | null>): number | null {
  const retryAfter = headers['retry-after'] ?? headers['Retry-After'];
  if (!retryAfter) return null;

  const seconds = parseInt(retryAfter, 10);
  if (!isNaN(seconds)) {
    return seconds * 1000 + jitter(1000);
  }

  const date = new Date(retryAfter);
  if (!isNaN(date.getTime())) {
    return Math.max(0, date.getTime() - Date.now()) + jitter(1000);
  }

  return null;
}

export function checkTokenBucket(key: string): boolean {
  const now = Date.now();
  const bucket = buckets.get(key) ?? { tokens: QUOTA_CONFIG.burstLimit, lastRefill: now };

  const elapsed = now - bucket.lastRefill;
  const refill = (elapsed / 1000) * QUOTA_CONFIG.requestsPerSecond;
  bucket.tokens = Math.min(bucket.tokens + refill, QUOTA_CONFIG.burstLimit);
  bucket.lastRefill = now;

  if (bucket.tokens < 1) {
    buckets.set(key, bucket);
    return false;
  }

  bucket.tokens -= 1;
  buckets.set(key, bucket);
  return true;
}

export function checkRateLimit(key: string): { allowed: boolean; retryAfterMs: number } {
  const now = Date.now();
  const windowMs = 1000;
  const windowStart = Math.floor(now / windowMs) * windowMs;

  const state = rateLimitWindows.get(key) ?? { windowStart, requestCount: 0 };

  if (state.windowStart !== windowStart) {
    state.windowStart = windowStart;
    state.requestCount = 0;
  }

  state.requestCount++;

  if (state.requestCount > QUOTA_CONFIG.requestsPerSecond) {
    rateLimitWindows.set(key, state);
    const retryAfterMs = windowStart + windowMs - now + 100;
    return { allowed: false, retryAfterMs };
  }

  rateLimitWindows.set(key, state);
  return { allowed: true, retryAfterMs: 0 };
}

export function checkDailyQuota(): boolean {
  const count = getDailyCount();
  const dailyLimit = QUOTA_CONFIG.requestsPerDay;
  const exceeded = count >= dailyLimit;

  if (exceeded && !quotaExceededAlertSent) {
    logger.error('Google Calendar daily quota exceeded', {
      count,
      dailyLimit,
      date: getCurrentDate(),
    });
    quotaExceededAlertSent = true;
  }

  if (!exceeded) {
    quotaExceededAlertSent = false;
  }

  return !exceeded;
}

export function getQuotaUsage() {
  const count = getDailyCount();
  const dailyLimit = QUOTA_CONFIG.requestsPerDay;
  const usage = dailyLimit > 0 ? (count / dailyLimit) * 100 : 0;

  return {
    dailyRequests: count,
    dailyLimit,
    usagePercent: Math.round(usage * 100) / 100,
    quotaExceeded: count >= dailyLimit,
    alertTriggered: usage >= QUOTA_CONFIG.alertThreshold * 100,
    requestsPerSecond: QUOTA_CONFIG.requestsPerSecond,
    burstLimit: QUOTA_CONFIG.burstLimit,
    secondsUntilMidnight: getSecondsUntilMidnight(),
  };
}

export async function withQuotaProtection<T>(
  key: string,
  fn: () => Promise<T>,
  attempt: number = 1,
  maxRetries: number = 3,
): Promise<T> {
  if (!checkDailyQuota()) {
    const resetIn = getSecondsUntilMidnight();
    logger.warn('Daily quota exceeded, throttling', { key, resetInSeconds: resetIn });
    throw new QuotaExceededError(`Daily quota exceeded. Resets in ${resetIn}s`);
  }

  const rateCheck = checkRateLimit(key);
  if (!rateCheck.allowed) {
    logger.debug('Rate limited, waiting', { key, retryAfterMs: rateCheck.retryAfterMs });
    await new Promise((resolve) => setTimeout(resolve, rateCheck.retryAfterMs));
  }

  const bucketCheck = checkTokenBucket(key);
  if (!bucketCheck) {
    const backoffMs = jitter(200);
    await new Promise((resolve) => setTimeout(resolve, backoffMs));
  }

  incrementDailyCount();

  try {
    return await fn();
  } catch (err) {
    const gErr = err as { code?: number; status?: number; response?: { headers?: Record<string, string> } };
    const status = gErr.code ?? gErr.status ?? 0;
    const headers = gErr.response?.headers ?? {};

    if (status === 429) {
      const retryDelay = getRetryDelayFromHeaders(headers);
      if (retryDelay && attempt < maxRetries) {
        logger.warn('Rate limited by Google, applying Retry-After', {
          key,
          retryDelayMs: retryDelay,
          attempt,
          maxRetries,
        });
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
        return withQuotaProtection(key, fn, attempt + 1, maxRetries);
      }
    }

    if (status >= 500 && status < 600 && attempt < maxRetries) {
      await exponentialBackoff(attempt);
      return withQuotaProtection(key, fn, attempt + 1, maxRetries);
    }

    throw err;
  }
}

export class QuotaExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QuotaExceededError';
  }
}

export function getQuotaAlertThreshold(): number {
  return QUOTA_CONFIG.alertThreshold;
}
