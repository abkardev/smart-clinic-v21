const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 } as const;
type Level = keyof typeof LOG_LEVELS;

const currentLevel: Level =
  (process.env.LOG_LEVEL as Level) || (process.env.NODE_ENV === 'production' ? 'info' : 'debug');

function shouldLog(level: Level): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[currentLevel];
}

function fmt(level: Level, msg: string, meta?: Record<string, unknown>) {
  const ts = new Date().toISOString();
  const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
  return `[${ts}] ${level.toUpperCase()} ${msg}${metaStr}`;
}

export const logger = {
  debug: (msg: string, meta?: Record<string, unknown>) => {
    if (shouldLog('debug')) console.debug(fmt('debug', msg, meta));
  },
  info: (msg: string, meta?: Record<string, unknown>) => {
    if (shouldLog('info')) console.log(fmt('info', msg, meta));
  },
  warn: (msg: string, meta?: Record<string, unknown>) => {
    if (shouldLog('warn')) console.warn(fmt('warn', msg, meta));
  },
  error: (msg: string, meta?: Record<string, unknown>) => {
    if (shouldLog('error')) console.error(fmt('error', msg, meta));
  },
};
