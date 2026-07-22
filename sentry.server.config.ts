import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN || '',
  environment: process.env.NODE_ENV || 'development',
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  integrations: [
    Sentry.prismaIntegration(),
  ],
  beforeSend(event) {
    if (process.env.NODE_ENV === 'development') return null;
    if (event.exception?.values?.[0]?.type === 'PrismaClientKnownRequestError') {
      event.tags = { ...event.tags, prisma: true };
    }
    return event;
  },
});
