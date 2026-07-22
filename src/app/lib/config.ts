import { logger } from './logger';

export interface ConfigValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

const REQUIRED_VARS = [
  'DATABASE_URL',
  'JWT_SECRET',
] as const;

const CRITICAL_VARS = [
  'DATABASE_URL',
  'JWT_SECRET',
] as const;

const OPTIONAL_VARS = [
  'WHATSAPP_TOKEN',
  'WHATSAPP_PHONE_ID',
  'WHATSAPP_VERIFY_TOKEN',
  'INSTAGRAM_TOKEN',
  'INSTAGRAM_VERIFY_TOKEN',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'GOOGLE_REFRESH_TOKEN',
  'BLOB_READ_WRITE_TOKEN',
  'NEXT_PUBLIC_APP_URL',
  'RESEND_API_KEY',
  'SENTRY_DSN',
  'CALENDAR_RETRY_ENABLED',
  'CALENDAR_RETRY_BATCH_SIZE',
  'CALENDAR_INTERNAL_SECRET',
  'LOG_LEVEL',
] as const;

const GOOGLE_VARS = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REFRESH_TOKEN'] as const;
const WHATSAPP_VARS = ['WHATSAPP_TOKEN', 'WHATSAPP_PHONE_ID', 'WHATSAPP_VERIFY_TOKEN'] as const;
const INSTAGRAM_VARS = ['INSTAGRAM_TOKEN', 'INSTAGRAM_VERIFY_TOKEN'] as const;
const SCHEDULER_VARS = ['CALENDAR_RETRY_ENABLED', 'CALENDAR_INTERNAL_SECRET'] as const;

function checkVar(name: string): { present: boolean; value?: string } {
  const val = process.env[name];
  if (!val) return { present: false };
  if (val.startsWith('your_')) return { present: false, value: val };
  return { present: true, value: val };
}

export function validateConfig(): ConfigValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const name of REQUIRED_VARS) {
    const result = checkVar(name);
    if (!result.present) {
      errors.push(`Missing required environment variable: ${name}`);
    }
  }

  for (const name of OPTIONAL_VARS) {
    const result = checkVar(name);
    if (!result.present) {
      warnings.push(`Missing optional environment variable: ${name}`);
    }
  }

  const googlePresent = GOOGLE_VARS.every(v => checkVar(v).present);
  const whatsappPresent = WHATSAPP_VARS.every(v => checkVar(v).present);
  const instagramPresent = INSTAGRAM_VARS.every(v => checkVar(v).present);
  const schedulerConfigured = checkVar('CALENDAR_RETRY_ENABLED').present;

  if (googlePresent) {
    const id = checkVar('GOOGLE_CLIENT_ID').value;
    if (id === 'your_google_client_id') {
      warnings.push('Google Calendar: CLIENT_ID is still set to placeholder value');
    }
  } else {
    warnings.push('Google Calendar: not fully configured');
  }

  if (whatsappPresent) {
    const token = checkVar('WHATSAPP_TOKEN').value;
    if (token?.includes('EAAN4')) {
      warnings.push('WHATSAPP_TOKEN appears to be a short-lived development token');
    }
  } else {
    warnings.push('WhatsApp: not fully configured');
  }

  if (instagramPresent) {
    const token = checkVar('INSTAGRAM_TOKEN').value;
    if (token === 'your_instagram_page_access_token') {
      warnings.push('INSTAGRAM_TOKEN is still set to placeholder value');
    }
  } else {
    warnings.push('Instagram: not fully configured');
  }

  if (schedulerConfigured) {
    const secret = checkVar('CALENDAR_INTERNAL_SECRET');
    if (!secret.present) {
      warnings.push('Scheduler: CALENDAR_INTERNAL_SECRET not set, retry endpoint uses fallback auth');
    }
  } else {
    warnings.push('Scheduler: CALENDAR_RETRY_ENABLED not set, retry worker is disabled');
  }

  const sentryConfigured = checkVar('SENTRY_DSN');
  if (!sentryConfigured.present) {
    warnings.push('Sentry: SENTRY_DSN not set, error monitoring disabled');
  }

  return { valid: errors.length === 0, errors, warnings };
}

export function validateConfigOrThrow(): void {
  const result = validateConfig();
  if (result.errors.length > 0) {
    for (const err of result.errors) {
      logger.error('Configuration error', { error: err });
    }
    logger.error('Configuration validation failed - application may not function correctly', {
      errorCount: result.errors.length,
    });
  }
  if (result.warnings.length > 0) {
    for (const warn of result.warnings) {
      logger.warn('Configuration warning', { warning: warn });
    }
  }
}
