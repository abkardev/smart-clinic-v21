import { prisma } from './prisma';
import type { Doctor } from '@prisma/client';

export const SERVICES = [
  'General Consultation',
  'Follow-up',
  'Specialist Visit',
  'Lab Results Review',
  'Prescription Renewal',
];

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
  } catch {
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

  const googleBusy = await getGoogleBusySlots(doctor.calendarId, date);

  const available = allSlots.filter((slot) => {
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

const DOW_LABELS_AR = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const DOW_LABELS_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export interface UpcomingDay {
  date: string;          // YYYY-MM-DD
  dayOfWeek: number;     // 0-6
  labelAr: string;       // e.g. "الأحد 28 يونيو"
  labelEn: string;       // e.g. "Sun, Jun 28"
  availableCount: number;
}

/**
 * Lists the next `daysAhead` calendar days for a doctor, each tagged with
 * how many open slots it has (0 means fully booked/holiday/non-working day).
 * This powers the click-based date picker in the WhatsApp/Instagram bots —
 * patients select a day from a list instead of typing a date manually.
 */
export async function listUpcomingDays(
  doctor: Doctor,
  daysAhead = 7
): Promise<UpcomingDay[]> {
  const today = new Date();
  const dateStrs: string[] = [];
  for (let i = 0; i < daysAhead; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    dateStrs.push(d.toISOString().split('T')[0]);
  }

  // Check availability for all days in parallel — this is a small, bounded
  // batch (daysAhead is always a small constant), so no need for the
  // batching pattern used in suggestAlternativeDates above.
  const results = await Promise.all(
    dateStrs.map((dateStr) =>
      getAvailableSlots(doctor, dateStr).then((r) => ({ dateStr, count: r.available.length }))
    )
  );

  return results.map(({ dateStr, count }) => {
    const d = new Date(dateStr);
    const dow = d.getDay();
    const dayNum = d.getDate();
    const monthAr = d.toLocaleDateString('ar-SA', { month: 'long' });
    const monthEn = d.toLocaleDateString('en-US', { month: 'short' });
    return {
      date: dateStr,
      dayOfWeek: dow,
      labelAr: `${DOW_LABELS_AR[dow]} ${dayNum} ${monthAr}`,
      labelEn: `${DOW_LABELS_EN[dow]}, ${monthEn} ${dayNum}`,
      availableCount: count,
    };
  });
}
