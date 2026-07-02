import { logger } from './logger';
import { metrics } from './metrics';

export interface RetryOptions {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  retryOn?: (status: number) => boolean;
}

const DEFAULT_OPTIONS: RetryOptions = {
  maxRetries: 3,
  baseDelayMs: 500,
  maxDelayMs: 8000,
  retryOn: (status: number) => status === 429 || status >= 500,
};

export async function fetchWithRetry(
  url: string,
  options: RequestInit,
  correlationId: string,
  retryOptions: Partial<RetryOptions> = {}
): Promise<Response> {
  const opts = { ...DEFAULT_OPTIONS, ...retryOptions };

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    const start = Date.now();
    try {
      const res = await fetch(url, options);
      const duration = Date.now() - start;

      if (res.ok) return res;

      if (opts.retryOn!(res.status) && attempt < opts.maxRetries) {
        metrics.retryAttempts.inc();
        const delay = Math.min(opts.baseDelayMs * Math.pow(2, attempt) + Math.random() * 100, opts.maxDelayMs);
        logger.warn('[Retry] transient error', {
          status: res.status, attempt, url: url.slice(0, 60),
          delay, duration, correlationId,
        });
        await new Promise(r => setTimeout(r, delay));
        continue;
      }

      return res;
    } catch (err) {
      const duration = Date.now() - start;
      if (attempt < opts.maxRetries) {
        metrics.retryAttempts.inc();
        const delay = Math.min(opts.baseDelayMs * Math.pow(2, attempt) + Math.random() * 100, opts.maxDelayMs);
        logger.warn('[Retry] network error', {
          error: String(err), attempt, delay, duration, correlationId,
        });
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      logger.error('[Retry] all retries exhausted', {
        error: String(err), url: url.slice(0, 60), correlationId,
      });
      metrics.retriesExhausted.inc();
      throw err;
    }
  }

  throw new Error('fetchWithRetry: unreachable');
}

export async function withDbRetry<T>(
  fn: () => Promise<T>,
  correlationId: string,
  maxRetries = 2
): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      const e = err as { code?: string };
      const isSerialization = e.code === '40001' || e.code === '40P01';
      if ((isSerialization || isTransientDbError(err)) && attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 100 + Math.random() * 50;
        logger.warn('[DbRetry] transient DB error', {
          error: String(err), attempt, delay, correlationId,
        });
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }
  throw new Error('withDbRetry: unreachable');
}

function isTransientDbError(err: unknown): boolean {
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    return msg.includes('connection') || msg.includes('timeout') || msg.includes('econnreset');
  }
  return false;
}
