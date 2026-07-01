import { NextResponse } from 'next/server';

/**
 * Normalizes a JSON value recursively:
 *  - BookingStatus.no_show → "no-show"  (Prisma enum → legacy frontend string)
 */
export function normalizeBookingStatus<T>(data: T): T {
  if (Array.isArray(data)) {
    return data.map(normalizeBookingStatus) as unknown as T;
  }
  if (data !== null && typeof data === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
      if (k === 'status' && v === 'no_show') {
        out[k] = 'no-show';
      } else {
        out[k] = normalizeBookingStatus(v);
      }
    }
    return out as T;
  }
  return data;
}

/**
 * Returns a normalized NextResponse with standard headers.
 * Use instead of NextResponse.json() in booking-related routes.
 */
export function apiResponse<T>(data: T, init?: ResponseInit): NextResponse {
  const normalized = normalizeBookingStatus(data);
  const res = NextResponse.json(normalized, init);
  // Short cache for read-heavy list endpoints
  if (!init?.status || init.status < 300) {
    res.headers.set('Cache-Control', 'private, no-cache');
  }
  return res;
}

/**
 * Converts "no-show" from the frontend into "no_show" for Prisma storage.
 */
export function toDbStatus(status: string | undefined): string | undefined {
  if (status === 'no-show') return 'no_show';
  return status;
}
