import { NextResponse } from 'next/server';
import { BookingStatus } from '@prisma/client';

const STATUS_TO_DB: Record<string, BookingStatus | undefined> = {
  'no-show': BookingStatus.no_show,
  no_show: BookingStatus.no_show,
  pending: BookingStatus.pending,
  confirmed: BookingStatus.confirmed,
  completed: BookingStatus.completed,
  cancelled: BookingStatus.cancelled,
};

const STATUS_FROM_DB: Record<string, string> = {
  no_show: 'no-show',
};

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
      if (k === 'status' && typeof v === 'string' && STATUS_FROM_DB[v]) {
        out[k] = STATUS_FROM_DB[v];
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
  if (!init?.status || init.status < 300) {
    res.headers.set('Cache-Control', 'private, no-cache');
  }
  return res;
}

/**
 * Converts a frontend status string into a Prisma BookingStatus value.
 * Returns the BookingStatus enum value, or undefined for unrecognized strings.
 */
export function toDbStatus(status: string | undefined): BookingStatus | undefined {
  return status ? STATUS_TO_DB[status] : undefined;
}
