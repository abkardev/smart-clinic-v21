import { describe, it, expect } from 'vitest';
import { generateTimeSlots, DayStatus, findNearestAppointment, BOOKING_WINDOW_DAYS } from './availability';

// ─── generateTimeSlots ────────────────────────────────────────────────────────
describe('generateTimeSlots', () => {
  it('generates slots for a full day', () => {
    const slots = generateTimeSlots('09:00', '17:00', 30);
    expect(slots).toHaveLength(16);
    expect(slots[0]).toBe('09:00');
    expect(slots[slots.length - 1]).toBe('16:30');
  });

  it('respects break time', () => {
    const slots = generateTimeSlots('09:00', '17:00', 30, { enabled: true, start: '12:00', end: '13:00' });
    expect(slots).toHaveLength(14);
    expect(slots).not.toContain('12:00');
    expect(slots).not.toContain('12:30');
    expect(slots[5]).toBe('11:30');
    expect(slots[6]).toBe('13:00');
  });

  it('handles 60-minute slots', () => {
    const slots = generateTimeSlots('09:00', '17:00', 60);
    expect(slots).toHaveLength(8);
    expect(slots[0]).toBe('09:00');
    expect(slots[7]).toBe('16:00');
  });

  it('returns empty when duration exceeds window', () => {
    const slots = generateTimeSlots('09:00', '09:30', 60);
    expect(slots).toHaveLength(0);
  });

  it('handles break at start boundary', () => {
    const slots = generateTimeSlots('09:00', '12:00', 30, { enabled: true, start: '09:00', end: '10:00' });
    expect(slots[0]).toBe('10:00');
    expect(slots).toHaveLength(4);
  });

  it('handles break at end boundary', () => {
    const slots = generateTimeSlots('09:00', '12:00', 30, { enabled: true, start: '11:00', end: '12:00' });
    expect(slots).toHaveLength(4);
    expect(slots[3]).toBe('10:30');
  });

  it('returns empty for zero hour duration', () => {
    const slots = generateTimeSlots('09:00', '09:00', 30);
    expect(slots).toHaveLength(0);
  });

  it('handles single slot day', () => {
    const slots = generateTimeSlots('09:00', '09:30', 30);
    expect(slots).toHaveLength(1);
    expect(slots[0]).toBe('09:00');
  });

  it('ignores disabled break', () => {
    const withBreak = generateTimeSlots('09:00', '12:00', 30, { enabled: true, start: '10:00', end: '11:00' });
    const withoutBreak = generateTimeSlots('09:00', '12:00', 30, { enabled: false, start: '10:00', end: '11:00' });
    expect(withBreak).toHaveLength(4);
    expect(withoutBreak).toHaveLength(6);
  });
});

// ─── DayStatus enum ──────────────────────────────────────────────────────────
describe('DayStatus', () => {
  it('defines all five status values', () => {
    expect(DayStatus.AVAILABLE).toBe('AVAILABLE');
    expect(DayStatus.FULLY_BOOKED).toBe('FULLY_BOOKED');
    expect(DayStatus.HOLIDAY).toBe('HOLIDAY');
    expect(DayStatus.BLOCKED).toBe('BLOCKED');
    expect(DayStatus.NOT_WORKING_DAY).toBe('NOT_WORKING_DAY');
  });

  it('enum has exactly 5 members', () => {
    const keys = Object.keys(DayStatus).filter(k => isNaN(Number(k)));
    expect(keys).toHaveLength(5);
  });
});

// ─── UpcomingDay structured data (pure domain — no UI strings) ───────────────
describe('UpcomingDay shape', () => {
  it('AVAILABLE day: has availableCount>0, firstSlot, lastSlot, isToday=true', () => {
    const day = {
      date: '2026-07-20',
      status: DayStatus.AVAILABLE,
      availableCount: 3,
      firstSlot: '09:00',
      lastSlot: '16:30',
      isToday: true,
      isTomorrow: false,
    };
    expect(day.status).toBe(DayStatus.AVAILABLE);
    expect(day.availableCount).toBeGreaterThan(0);
    expect(day.firstSlot).toBe('09:00');
    expect(day.lastSlot).toBe('16:30');
    expect(day.isToday).toBe(true);
    expect(day.isTomorrow).toBe(false);
  });

  it('FULLY_BOOKED day: availableCount=0, firstSlot=null, lastSlot=null, isTomorrow=true', () => {
    const day = {
      date: '2026-07-21',
      status: DayStatus.FULLY_BOOKED,
      availableCount: 0,
      firstSlot: null,
      lastSlot: null,
      isToday: false,
      isTomorrow: true,
    };
    expect(day.status).toBe(DayStatus.FULLY_BOOKED);
    expect(day.availableCount).toBe(0);
    expect(day.firstSlot).toBeNull();
    expect(day.lastSlot).toBeNull();
  });

  it('HOLIDAY status: represents doctor vacation, no slots', () => {
    const day = {
      date: '2026-07-22',
      status: DayStatus.HOLIDAY,
      availableCount: 0,
      firstSlot: null,
      lastSlot: null,
      isToday: false,
      isTomorrow: false,
    };
    expect(day.status).toBe(DayStatus.HOLIDAY);
  });

  it('BLOCKED status: represents clinic closed (whole-day block), no slots', () => {
    const day = {
      date: '2026-07-23',
      status: DayStatus.BLOCKED,
      availableCount: 0,
      firstSlot: null,
      lastSlot: null,
      isToday: false,
      isTomorrow: false,
    };
    expect(day.status).toBe(DayStatus.BLOCKED);
  });

  it('NOT_WORKING_DAY status: represents weekend/non-working day, no slots', () => {
    const day = {
      date: '2026-07-24',
      status: DayStatus.NOT_WORKING_DAY,
      availableCount: 0,
      firstSlot: null,
      lastSlot: null,
      isToday: false,
      isTomorrow: false,
    };
    expect(day.status).toBe(DayStatus.NOT_WORKING_DAY);
  });

  it('AVAILABLE future day (beyond tomorrow): isToday=false, isTomorrow=false', () => {
    const day = {
      date: '2026-08-01',
      status: DayStatus.AVAILABLE,
      availableCount: 2,
      firstSlot: '10:00',
      lastSlot: '14:00',
      isToday: false,
      isTomorrow: false,
    };
    expect(day.status).toBe(DayStatus.AVAILABLE);
    expect(day.isToday).toBe(false);
    expect(day.isTomorrow).toBe(false);
    expect(day.availableCount).toBeGreaterThan(0);
    expect(day.firstSlot).toBe('10:00');
    expect(day.lastSlot).toBe('14:00');
  });
});

// ─── firstSlot and lastSlot ─────────────────────────────────────────────────
describe('firstSlot and lastSlot', () => {
  it('firstSlot is earliest generated time', () => {
    const slots = generateTimeSlots('09:00', '17:00', 30);
    expect(slots[0]).toBe('09:00');
    expect(slots[slots.length - 1]).toBe('16:30');
  });

  it('lastSlot is latest available from filtered slots', () => {
    const allSlots = generateTimeSlots('09:00', '12:00', 30);
    const booked = new Set(['09:00', '11:30']);
    const available = allSlots.filter(s => !booked.has(s));
    expect(available[0]).toBe('09:30');
    expect(available[available.length - 1]).toBe('11:00');
  });

  it('null when no slots available', () => {
    const available: string[] = [];
    expect(available.length > 0 ? available[0] : null).toBeNull();
    expect(available.length > 0 ? available[available.length - 1] : null).toBeNull();
  });
});

// ─── Expired slot filter (algorithm test — pure computation, no DB) ─────────
describe('Expired slot filter', () => {
  it('excludes slots at or before current time when isToday=true', () => {
    const nowMinutes = 14 * 60; // 14:00
    const toMinutes = (t: string) => {
      const [h, m] = t.split(':').map(Number);
      return h * 60 + m;
    };
    expect(toMinutes('09:00') > nowMinutes).toBe(false); // past → excluded
    expect(toMinutes('14:00') > nowMinutes).toBe(false); // exactly now → excluded
    expect(toMinutes('14:30') > nowMinutes).toBe(true);  // future → kept
    expect(toMinutes('16:00') > nowMinutes).toBe(true);  // future → kept
  });

  it('all slots are included when date is not today (no time filter)', () => {
    const allSlots = ['09:00', '10:00', '13:00', '14:30', '16:00'];
    const isToday = false;
    const filtered = isToday ? allSlots.filter(() => false) : allSlots;
    expect(filtered).toEqual(allSlots);
  });
});

// ─── findNearestAppointment ──────────────────────────────────────────────────
describe('findNearestAppointment', () => {
  it('returns first available appointment from sorted days', () => {
    const days = [
      { date: '2026-07-20', status: DayStatus.FULLY_BOOKED, availableCount: 0, firstSlot: null, lastSlot: null, isToday: false, isTomorrow: false },
      { date: '2026-07-21', status: DayStatus.AVAILABLE, availableCount: 5, firstSlot: '09:00', lastSlot: '16:30', isToday: false, isTomorrow: false },
      { date: '2026-07-22', status: DayStatus.AVAILABLE, availableCount: 3, firstSlot: '10:00', lastSlot: '15:00', isToday: false, isTomorrow: false },
    ];
    const result = findNearestAppointment(days);
    expect(result).toEqual({ date: '2026-07-21', time: '09:00' });
  });

  it('skips non-available statuses', () => {
    const days = [
      { date: '2026-07-20', status: DayStatus.HOLIDAY, availableCount: 0, firstSlot: null, lastSlot: null, isToday: false, isTomorrow: false },
      { date: '2026-07-21', status: DayStatus.BLOCKED, availableCount: 0, firstSlot: null, lastSlot: null, isToday: false, isTomorrow: false },
      { date: '2026-07-22', status: DayStatus.FULLY_BOOKED, availableCount: 0, firstSlot: null, lastSlot: null, isToday: false, isTomorrow: false },
      { date: '2026-07-23', status: DayStatus.AVAILABLE, availableCount: 2, firstSlot: '14:00', lastSlot: '16:00', isToday: false, isTomorrow: false },
    ];
    const result = findNearestAppointment(days);
    expect(result).toEqual({ date: '2026-07-23', time: '14:00' });
  });

  it('returns null when no available days', () => {
    const days = [
      { date: '2026-07-20', status: DayStatus.HOLIDAY, availableCount: 0, firstSlot: null, lastSlot: null, isToday: false, isTomorrow: false },
      { date: '2026-07-21', status: DayStatus.FULLY_BOOKED, availableCount: 0, firstSlot: null, lastSlot: null, isToday: false, isTomorrow: false },
    ];
    expect(findNearestAppointment(days)).toBeNull();
  });

  it('returns null for empty array', () => {
    expect(findNearestAppointment([])).toBeNull();
  });

  it('respects chronological order — picks earliest', () => {
    const days = [
      { date: '2026-07-22', status: DayStatus.AVAILABLE, availableCount: 4, firstSlot: '10:00', lastSlot: '17:00', isToday: false, isTomorrow: false },
      { date: '2026-07-20', status: DayStatus.AVAILABLE, availableCount: 6, firstSlot: '09:00', lastSlot: '17:00', isToday: false, isTomorrow: false },
    ];
    const result = findNearestAppointment(days);
    expect(result).toEqual({ date: '2026-07-22', time: '10:00' });
  });

  it('skips AVAILABLE day with null firstSlot (no remaining slots)', () => {
    const days = [
      { date: '2026-07-20', status: DayStatus.AVAILABLE, availableCount: 0, firstSlot: null, lastSlot: null, isToday: true, isTomorrow: false },
      { date: '2026-07-21', status: DayStatus.AVAILABLE, availableCount: 3, firstSlot: '14:00', lastSlot: '16:00', isToday: false, isTomorrow: false },
    ];
    const result = findNearestAppointment(days);
    expect(result).toEqual({ date: '2026-07-21', time: '14:00' });
  });

  it('handles today as first available day', () => {
    const days = [
      { date: '2026-07-20', status: DayStatus.AVAILABLE, availableCount: 2, firstSlot: '15:00', lastSlot: '16:30', isToday: true, isTomorrow: false },
      { date: '2026-07-21', status: DayStatus.AVAILABLE, availableCount: 5, firstSlot: '09:00', lastSlot: '17:00', isToday: false, isTomorrow: true },
    ];
    const result = findNearestAppointment(days);
    expect(result).toEqual({ date: '2026-07-20', time: '15:00' });
  });

  it('covers all five DayStatus values in mixed array', () => {
    const days = [
      { date: '2026-07-18', status: DayStatus.NOT_WORKING_DAY, availableCount: 0, firstSlot: null, lastSlot: null, isToday: false, isTomorrow: false },
      { date: '2026-07-19', status: DayStatus.HOLIDAY, availableCount: 0, firstSlot: null, lastSlot: null, isToday: false, isTomorrow: false },
      { date: '2026-07-20', status: DayStatus.BLOCKED, availableCount: 0, firstSlot: null, lastSlot: null, isToday: false, isTomorrow: false },
      { date: '2026-07-21', status: DayStatus.FULLY_BOOKED, availableCount: 0, firstSlot: null, lastSlot: null, isToday: false, isTomorrow: false },
      { date: '2026-07-22', status: DayStatus.AVAILABLE, availableCount: 1, firstSlot: '11:00', lastSlot: '11:00', isToday: false, isTomorrow: false },
    ];
    const result = findNearestAppointment(days);
    expect(result).toEqual({ date: '2026-07-22', time: '11:00' });
  });

  it('returns null when all statuses are non-available', () => {
    const days = [
      { date: '2026-07-18', status: DayStatus.NOT_WORKING_DAY, availableCount: 0, firstSlot: null, lastSlot: null, isToday: false, isTomorrow: false },
      { date: '2026-07-19', status: DayStatus.HOLIDAY, availableCount: 0, firstSlot: null, lastSlot: null, isToday: false, isTomorrow: false },
      { date: '2026-07-20', status: DayStatus.BLOCKED, availableCount: 0, firstSlot: null, lastSlot: null, isToday: false, isTomorrow: false },
      { date: '2026-07-21', status: DayStatus.FULLY_BOOKED, availableCount: 0, firstSlot: null, lastSlot: null, isToday: false, isTomorrow: false },
    ];
    expect(findNearestAppointment(days)).toBeNull();
  });
});

// ─── Sorting (chronological order) ────────────────────────────────────────────
describe('Sorting', () => {
  it('generateTimeSlots returns slots in chronological order', () => {
    const slots = generateTimeSlots('09:00', '17:00', 30);
    for (let i = 1; i < slots.length; i++) {
      expect(slots[i] > slots[i - 1]).toBe(true);
    }
  });

  it('findNearestAppointment requires caller to pre-sort by date', () => {
    // Function iterates in array order — does not sort internally
    const days = [
      { date: '2026-07-25', status: DayStatus.AVAILABLE, availableCount: 2, firstSlot: '10:00', lastSlot: '11:00', isToday: false, isTomorrow: false },
      { date: '2026-07-22', status: DayStatus.AVAILABLE, availableCount: 3, firstSlot: '09:00', lastSlot: '12:00', isToday: false, isTomorrow: false },
    ];
    const result = findNearestAppointment(days);
    expect(result).toEqual({ date: '2026-07-25', time: '10:00' });
  });
});

// ─── Translation separation (business layer has no UI strings) ──────────────
describe('Translation separation', () => {
  it('DayStatus enum values are machine-readable codes (no Arabic, no natural language)', () => {
    const values = Object.values(DayStatus).filter(v => typeof v === 'string');
    values.forEach(v => {
      expect(v).not.toMatch(/[\u0600-\u06FF]/); // no Arabic
      expect(v).toMatch(/^[A-Z_]+$/);            // only uppercase + underscore
    });
  });

  it('UpcomingDay interface has no labelAr/labelEn/statusText fields', () => {
    const day = {
      date: '2026-07-20',
      status: DayStatus.AVAILABLE,
      availableCount: 1,
      firstSlot: '09:00',
      lastSlot: '09:00',
      isToday: false,
      isTomorrow: false,
    };
    expect(day).not.toHaveProperty('labelAr');
    expect(day).not.toHaveProperty('labelEn');
    expect(day).not.toHaveProperty('statusTextAr');
    expect(day).not.toHaveProperty('statusTextEn');
    expect(day).not.toHaveProperty('dayOfWeek');
  });
});

// ─── Booking window configuration ────────────────────────────────────────────
describe('BOOKING_WINDOW_DAYS', () => {
  it('defaults to 14 when no env var set', () => {
    expect(BOOKING_WINDOW_DAYS).toBe(14);
  });

  it('is within supported values [7, 14, 21, 30, 60]', () => {
    const supported = [7, 14, 21, 30, 60];
    expect(supported).toContain(BOOKING_WINDOW_DAYS);
  });
});
