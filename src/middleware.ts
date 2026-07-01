import { NextRequest, NextResponse } from 'next/server';

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
  } catch {
    return false;
  }
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (!pathname.startsWith('/api/')) return NextResponse.next();
  if (PUBLIC_PREFIXES.some(p => pathname.startsWith(p))) return NextResponse.next();

  const auth = req.headers.get('authorization');
  if (!auth?.startsWith('Bearer ')) {
    return NextResponse.json({ message: 'Not authenticated' }, { status: 401 });
  }

  const token = auth.slice(7);
  if (!isValidJwtFormat(token)) {
    return NextResponse.json({ message: 'Invalid token format' }, { status: 401 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/api/:path*'],
};
