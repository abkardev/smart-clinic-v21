import { prisma } from './prisma';
import { logger } from './logger';
import type { Doctor } from '@prisma/client';

function toMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

interface BreakConfig {
  enabled: boolean;
  start: string;
  end: string;
}

export function generateTimeSlots(
  startTime: string,
  endTime: string,
  durationMinutes: number,
  breakTime?: BreakConfig | null
): string[] {
  const slots: string[] = [];
  let cur = toMinutes(startTime);
  const end = toMinutes(endTime);
  const breakStart = breakTime?.enabled ? toMinutes(breakTime.start) : null;
  const breakEnd = breakTime?.enabled ? toMinutes(breakTime.end) : null;

  while (cur + durationMinutes <= end) {
    if (breakStart !== null && breakEnd !== null && cur < breakEnd && cur + durationMinutes > breakStart) {
      cur = breakEnd;
      continue;
    }
    slots.push(`${pad(Math.floor(cur / 60))}:${pad(cur % 60)}`);
    cur += durationMinutes;
  }
  return slots;
}

// ─── Time formatting helpers (clinic locale) ──────────────────────────────────

const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';

export function toArabicDigit(n: number): string {
  return String(n).replace(/\d/g, d => ARABIC_DIGITS[parseInt(d, 10)]);
}

export function formatTimeForAr(time: string): string {
  const [hStr, mStr] = time.split(':');
  const h = parseInt(hStr, 10);
  const period = h >= 12 ? 'مساءً' : 'صباحاً';
  const h12 = h % 12 || 12;
  return `${toArabicDigit(h12)}:${mStr.replace(/\d/g, d => ARABIC_DIGITS[parseInt(d, 10)])} ${period}`;
}

export function formatTimeForEn(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

// ─── Google Calendar free/busy lookup ─────────────────────────────────────────
// PERFORMANCE FIX: short-circuit immediately when Google Calendar isn't
// configured. Previously this always dynamically imported the ~30MB
// `googleapis` package and attempted a network call on every single
// availability check, even with no credentials set — adding seconds of
// latency to every booking page load and every bot interaction.
const GOOGLE_CONFIGURED = Boolean(
  process.env.GOOGLE_CLIENT_ID &&
  process.env.GOOGLE_CLIENT_SECRET &&
  process.env.GOOGLE_REFRESH_TOKEN
);

async function getGoogleBusySlots(calendarId: string, date: string): Promise<{ start: string; end: string }[]> {
  if (!GOOGLE_CONFIGURED) return [];
  try {
    const { google } = await import('./google');
    const timeMin = new Date(`${date}T00:00:00`).toISOString();
    const timeMax = new Date(`${date}T23:59:59`).toISOString();
    const response = await google.freebusy.query({
      requestBody: { timeMin, timeMax, items: [{ id: calendarId }] },
    });
    return (response.data.calendars?.[calendarId]?.busy ?? []) as { start: string; end: string }[];
  } catch (err) {
    logger.warn('Failed to fetch Google busy slots', { error: String(err), calendarId });
    return [];
  }
}

// ─── Main availability function ───────────────────────────────────────────────
interface SlotsResult {
  available: string[];
  all: string[];
  reason?: string;
  holidayName?: string;
  blockedTimes?: string[];
}

export async function getAvailableSlots(doctor: Doctor, date: string): Promise<SlotsResult> {
  const dayOfWeek = new Date(date).getDay();

  // PERFORMANCE FIX: these two holiday checks are independent (one filters
  // by dayOfWeek, the other by exact date) — they were previously awaited
  // sequentially, doubling the round-trip latency for no reason.
  const [weeklyHoliday, dateHoliday] = await Promise.all([
    prisma.holiday.findFirst({
      where: {
        type: 'weekly',
        dayOfWeek,
        OR: [
          { applyToAll: true },
          { doctors: { some: { doctorId: doctor.id } } },
        ],
      },
    }),
    prisma.holiday.findFirst({
      where: {
        type: 'date',
        date,
        OR: [
          { applyToAll: true },
          { doctors: { some: { doctorId: doctor.id } } },
        ],
      },
    }),
  ]);

  if (weeklyHoliday) {
    return { available: [], all: [], reason: 'holiday', holidayName: weeklyHoliday.nameEn };
  }
  if (dateHoliday) {
    return { available: [], all: [], reason: 'holiday', holidayName: dateHoliday.nameEn };
  }

  // Check working days
  if (!doctor.workingDays.includes(dayOfWeek)) {
    return { available: [], all: [], reason: 'notWorkingDay' };
  }

  const allSlots = generateTimeSlots(
    doctor.workingStart,
    doctor.workingEnd,
    doctor.slotDuration,
    doctor.breakEnabled
      ? { enabled: true, start: doctor.breakStart, end: doctor.breakEnd }
      : null
  );

  const [dbBookings, blockedSlots] = await Promise.all([
    prisma.booking.findMany({
      where: { doctorId: doctor.id, date, status: { notIn: ['cancelled'] } },
      select: { time: true },
    }),
    prisma.blockedSlot.findMany({
      where: { doctorId: doctor.id, date },
    }),
  ]);

  const dbBusy = new Set(dbBookings.map((b) => b.time));
  const isWholeDay = blockedSlots.some((s) => s.isWholeDay);
  const blockedTimes = new Set(
    blockedSlots.filter((s) => !s.isWholeDay && s.time).map((s) => s.time as string)
  );

  if (isWholeDay) {
    return { available: [], all: allSlots, reason: 'blocked' };
  }

  // ── Time-sensitive filters (today only) ──────────────────────────────────
  // Uses clinic timezone for all calculations — never relies on server time.
  const clinicNow = getClinicNow(CLINIC_TIMEZONE);
  const isToday = date === clinicNow.date;
  const todayFiltered = isToday
    ? new Set(filterTodaySlots(allSlots, clinicNow.minutes, BOOKING_BUFFER_MINUTES, MINIMUM_ADVANCE_BOOKING_HOURS))
    : null;

  const googleBusy = await getGoogleBusySlots(doctor.calendarId, date);

  const available = allSlots.filter((slot) => {
    if (todayFiltered && !todayFiltered.has(slot)) return false;
    if (dbBusy.has(slot) || blockedTimes.has(slot)) return false;
    const ss = new Date(`${date}T${slot}:00`);
    const se = new Date(ss.getTime() + doctor.slotDuration * 60000);
    return !googleBusy.some((b) => ss < new Date(b.end) && se > new Date(b.start));
  });

  return { available, all: allSlots, blockedTimes: [...blockedTimes] };
}

export async function suggestAlternativeDates(
  doctor: Doctor,
  fromDate: string,
  daysAhead = 7
): Promise<{ date: string; availableCount: number }[]> {
  const suggestions: { date: string; availableCount: number }[] = [];
  const start = new Date(fromDate);

  const dateStrs: string[] = [];
  for (let i = 1; i <= daysAhead; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    dateStrs.push(d.toISOString().split('T')[0]);
  }

  // PERFORMANCE FIX: previously this awaited getAvailableSlots() one date at
  // a time in a for-loop, multiplying DB round-trip latency by up to 7x.
  // Check dates in small parallel batches (3 at a time) so we still benefit
  // from an early exit once we have enough suggestions, without serializing
  // every single day.
  const BATCH_SIZE = 3;
  for (let i = 0; i < dateStrs.length && suggestions.length < 3; i += BATCH_SIZE) {
    const batch = dateStrs.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map((dateStr) => getAvailableSlots(doctor, dateStr).then((r) => ({ dateStr, available: r.available })))
    );
    for (const { dateStr, available } of results) {
      if (available.length > 0 && suggestions.length < 3) {
        suggestions.push({ date: dateStr, availableCount: available.length });
      }
    }
  }

  return suggestions;
}

// ─── Booking window configuration ────────────────────────────────────────────

const SUPPORTED_WINDOWS = [7, 14, 21, 30, 60];

function parseBookingWindow(): number {
  const raw = process.env.BOOKING_WINDOW_DAYS;
  if (raw) {
    const n = parseInt(raw, 10);
    if (SUPPORTED_WINDOWS.includes(n)) return n;
  }
  return 14;
}

export const BOOKING_WINDOW_DAYS = parseBookingWindow();

// ─── Clinic timezone ─────────────────────────────────────────────────────────
export const CLINIC_TIMEZONE = process.env.CLINIC_TIMEZONE || 'Asia/Riyadh';

// ─── Booking buffer (minutes) ────────────────────────────────────────────────
function parseBookingBuffer(): number {
  const raw = process.env.BOOKING_BUFFER_MINUTES;
  if (raw) {
    const n = parseInt(raw, 10);
    if (!isNaN(n) && n >= 0) return n;
  }
  return 0;
}
export const BOOKING_BUFFER_MINUTES = parseBookingBuffer();

// ─── Minimum advance booking hours ───────────────────────────────────────────
function parseMinimumAdvance(): number {
  const raw = process.env.MINIMUM_ADVANCE_BOOKING_HOURS;
  if (raw) {
    const n = parseInt(raw, 10);
    if (!isNaN(n) && n >= 0) return n;
  }
  return 3;
}
export const MINIMUM_ADVANCE_BOOKING_HOURS = parseMinimumAdvance();

// ─── Clinic timezone-aware current time ─────────────────────────────────────
export function getClinicNow(tz?: string): { date: string; minutes: number } {
  const timezone = tz || CLINIC_TIMEZONE;
  const nowStr = new Date().toLocaleString('sv-SE', { timeZone: timezone });
  const [date, time] = nowStr.split(' ');
  const [h, m] = time.split(':').map(Number);
  return { date, minutes: h * 60 + m };
}

/**
 * Pure function: filters today's slots using the combined cutoff from
 * expired-slot, booking-buffer, and minimum-advance-booking rules.
 * Only the strictest constraint applies.
 */
export function filterTodaySlots(
  slots: string[],
  nowMinutes: number,
  bufferMinutes: number,
  advanceHours: number
): string[] {
  const cutoff = Math.max(
    nowMinutes + 1,
    nowMinutes + bufferMinutes,
    nowMinutes + advanceHours * 60
  );
  return slots.filter((s) => toMinutes(s) >= cutoff);
}

// ─── Date arithmetic (timezone-safe) ─────────────────────────────────────────
function addDays(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + n));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

// ─── Domain types (pure business, no UI strings) ─────────────────────────────

export enum DayStatus {
  AVAILABLE = 'AVAILABLE',
  FULLY_BOOKED = 'FULLY_BOOKED',
  HOLIDAY = 'HOLIDAY',
  BLOCKED = 'BLOCKED',
  NOT_WORKING_DAY = 'NOT_WORKING_DAY',
}

export interface UpcomingDay {
  date: string;                // YYYY-MM-DD
  status: DayStatus;
  availableCount: number;
  firstSlot: string | null;    // "09:00" or null
  lastSlot: string | null;     // "16:30" or null
  isToday: boolean;
  isTomorrow: boolean;
}

export interface NearestAppointment {
  date: string;    // YYYY-MM-DD
  time: string;    // "09:00"
}

/**
 * Scans a pre-computed UpcomingDay array and returns the earliest available
 * slot. Pure function — O(n), no DB calls. Returns null when no slots exist.
 */
export function findNearestAppointment(days: UpcomingDay[]): NearestAppointment | null {
  for (const day of days) {
    if (day.status === DayStatus.AVAILABLE && day.firstSlot) {
      return { date: day.date, time: day.firstSlot };
    }
  }
  return null;
}

/**
 * Lists the next `daysAhead` calendar days for a doctor.
 * Returns structured data only — no UI strings, no translations.
 * All formatting belongs in the presentation layer.
 */
export async function listUpcomingDays(
  doctor: Doctor,
  daysAhead = BOOKING_WINDOW_DAYS
): Promise<UpcomingDay[]> {
  const clinicNow = getClinicNow(CLINIC_TIMEZONE);
  const todayLocal = clinicNow.date;
  const tomorrowLocal = addDays(todayLocal, 1);

  const dateStrs: string[] = [];
  for (let i = 0; i < daysAhead; i++) {
    dateStrs.push(addDays(todayLocal, i));
  }

  // All availability checks run in parallel — single pass, O(n)
  const results = await Promise.all(
    dateStrs.map((dateStr) =>
      getAvailableSlots(doctor, dateStr).then((r) => ({ dateStr, ...r }))
    )
  );

  return results.map(({ dateStr, available, all, reason }) => {
    const isToday = dateStr === todayLocal;
    const isTomorrow = dateStr === tomorrowLocal;
    const availableCount = available.length;
    const firstSlot = availableCount > 0 ? available[0] : null;
    const lastSlot = availableCount > 0 ? available[availableCount - 1] : null;

    let status: DayStatus;
    if (reason === 'holiday') {
      status = DayStatus.HOLIDAY;
    } else if (reason === 'blocked') {
      status = DayStatus.BLOCKED;
    } else if (reason === 'notWorkingDay') {
      status = DayStatus.NOT_WORKING_DAY;
    } else if (availableCount === 0) {
      status = DayStatus.FULLY_BOOKED;
    } else {
      status = DayStatus.AVAILABLE;
    }

    return { date: dateStr, status, availableCount, firstSlot, lastSlot, isToday, isTomorrow };
  });
}
