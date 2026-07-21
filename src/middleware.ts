import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/app/lib/logger';

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
};

const PUBLIC_PREFIXES = [
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/forgot-password',
  '/api/auth/reset-password',
  '/api/health',
  '/api/whatsapp/webhook',      // Meta webhook — verified by WHATSAPP_VERIFY_TOKEN
  '/api/instagram/webhook',     // Meta webhook — verified by INSTAGRAM_VERIFY_TOKEN
  '/api/doctors',               // Public: booking widget reads doctor list
  '/api/bookings/available-slots',
];

// Edge-compatible JWT format check (header.payload.signature).
// Full verification (signature + expiry) happens in the API routes via getAuthUser().
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

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith('/api/')) {
    if (PUBLIC_PREFIXES.some(p => pathname.startsWith(p))) {
      const res = NextResponse.next();
      addSecurityHeaders(res);
      return res;
    }

    const auth = req.headers.get('authorization');
    if (!auth?.startsWith('Bearer ')) {
      return NextResponse.json({ message: 'Not authenticated' }, { status: 401 });
    }

    const token = auth.slice(7);
    if (!isValidJwtFormat(token)) {
      return NextResponse.json({ message: 'Invalid token format' }, { status: 401 });
    }
  }

  const res = NextResponse.next();
  addSecurityHeaders(res);
  return res;
}

function addSecurityHeaders(res: NextResponse) {
  Object.entries(SECURITY_HEADERS).forEach(([key, value]) => {
    res.headers.set(key, value);
  });
  if (process.env.NODE_ENV === 'production') {
    res.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
}

export const config = {
  matcher: ['/api/:path*'],
};
