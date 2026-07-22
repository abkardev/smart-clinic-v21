const LOG_LEVELS = { trace: -1, debug: 0, info: 1, warn: 2, error: 3 } as const;
type Level = keyof typeof LOG_LEVELS;

function isValidLevel(s: string): s is Level {
  return s in LOG_LEVELS;
}

const currentLevel: Level = (() => {
  const envLevel = process.env.LOG_LEVEL;
  if (envLevel && isValidLevel(envLevel)) return envLevel;
  return process.env.NODE_ENV === 'production' ? 'info' : 'debug';
})();

interface LogMeta {
  [key: string]: unknown;
  correlationId?: string;
  conversationId?: string;
  executionTimeMs?: number;
  duration?: number;
  route?: string;
  method?: string;
  statusCode?: number;
  memoryUsage?: string;
  environment?: string;
}

function shouldLog(level: Level): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[currentLevel];
}

function fmt(level: Level, msg: string, meta?: LogMeta) {
  const ts = new Date().toISOString();
  const parts = [`[${ts}]`, level.toUpperCase(), msg];
  if (meta?.correlationId) parts.unshift(`[${meta.correlationId}]`);
  if (meta) {
    const { correlationId: _cid, ...rest } = meta;
    if (Object.keys(rest).length > 0) {
      parts.push(JSON.stringify(rest));
    }
  }
  return parts.join(' ');
}

function captureSentry(level: Level, msg: string, meta?: LogMeta) {
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN && !process.env.SENTRY_DSN) return;
  try {
    const Sentry = require('@sentry/nextjs');
    const scope = new Sentry.Scope();
    if (meta) {
      const { error, ...tags } = meta;
      scope.setExtras(tags);
      if (error) scope.setExtra('errorDetail', error);
    }
    if (level === 'error') {
      const err = meta?.error instanceof Error ? meta.error : new Error(msg);
      Sentry.captureException(err, scope);
    } else if (level === 'warn') {
      Sentry.captureMessage(msg, 'warning');
    }
  } catch {
    // Sentry not available — fall through to console
  }
}

export const logger = {
  trace: (msg: string, meta?: LogMeta) => {
    if (shouldLog('trace')) console.debug(fmt('trace', msg, meta));
  },
  debug: (msg: string, meta?: LogMeta) => {
    if (shouldLog('debug')) console.debug(fmt('debug', msg, meta));
  },
  info: (msg: string, meta?: LogMeta) => {
    if (shouldLog('info')) console.log(fmt('info', msg, meta));
  },
  warn: (msg: string, meta?: LogMeta) => {
    if (shouldLog('warn')) {
      console.warn(fmt('warn', msg, meta));
      captureSentry('warn', msg, meta);
    }
  },
  error: (msg: string, meta?: LogMeta) => {
    if (shouldLog('error')) {
      console.error(fmt('error', msg, meta));
      captureSentry('error', msg, meta);
    }
  },
};
