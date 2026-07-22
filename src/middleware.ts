import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/app/lib/logger';

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https:; connect-src 'self' https:; frame-src 'none'; object-src 'none'",
};

const PUBLIC_PREFIXES = [
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/forgot-password',
  '/api/auth/reset-password',
  '/api/health',
  '/api/whatsapp/webhook',
  '/api/instagram/webhook',
  '/api/doctors',
  '/api/bookings/available-slots',
];

function isValidJwtFormat(token: string): boolean {
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  try {
    return parts.every(p => /^[A-Za-z0-9_-]+$/.test(p));
  } catch (err) {
    logger.warn('Invalid JWT format check failed', { error: String(err) });
    return false;
  }
}

function generateCorrelationId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `${ts}${rand}`;
}

function addSecurityHeaders(res: NextResponse) {
  Object.entries(SECURITY_HEADERS).forEach(([key, value]) => {
    res.headers.set(key, value);
  });
  if (process.env.NODE_ENV === 'production') {
    res.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const correlationId = generateCorrelationId();
  const start = Date.now();

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set('x-correlation-id', correlationId);

  if (pathname.startsWith('/api/')) {
    if (PUBLIC_PREFIXES.some(p => pathname.startsWith(p))) {
      const res = NextResponse.next({ request: { headers: requestHeaders } });
      res.headers.set('x-correlation-id', correlationId);
      addSecurityHeaders(res);
      logger.info(`Request ${req.method} ${pathname}`, {
        correlationId, method: req.method, route: pathname,
        environment: process.env.NODE_ENV || 'development',
      });
      return res;
    }

    const auth = req.headers.get('authorization');
    if (!auth?.startsWith('Bearer ')) {
      const res = NextResponse.json({ message: 'Not authenticated' }, { status: 401 });
      res.headers.set('x-correlation-id', correlationId);
      return res;
    }

    const token = auth.slice(7);
    if (!isValidJwtFormat(token)) {
      const res = NextResponse.json({ message: 'Invalid token format' }, { status: 401 });
      res.headers.set('x-correlation-id', correlationId);
      return res;
    }
  }

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('x-correlation-id', correlationId);

  response.headers.set('Server-Timing', `edge;dur=${Date.now() - start}`);

  addSecurityHeaders(response);
  logger.info(`${req.method} ${pathname}`, {
    correlationId, method: req.method, route: pathname,
    environment: process.env.NODE_ENV || 'development',
    duration: Date.now() - start,
  });
  return response;
}

export const config = {
  matcher: ['/api/:path*'],
};
