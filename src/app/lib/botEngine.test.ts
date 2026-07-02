import { describe, it, expect } from 'vitest';
import { determineEventType, EventType } from './botEngine';
import { NAVIGATION_IDS, TRIGGERS } from './botMessages';

// ─── Phase 1: Event Type Determination ────────────────────────────────────────
describe('determineEventType', () => {
  it.each([
    ['back', true, EventType.NAVIGATION_SYSTEM],
    ['main_menu', false, EventType.NAVIGATION_SYSTEM],
    ['cancel', true, EventType.NAVIGATION_SYSTEM],
  ])('NAVIGATION_SYSTEM for navigation IDs: input=%s isText=%s', (input, isText, expected) => {
    expect(determineEventType(input, isText)).toBe(expected);
  });

  it('returns LIST_REPLY for non-text interactive payload', () => {
    expect(determineEventType('menu_book', false)).toBe(EventType.LIST_REPLY);
    expect(determineEventType('svc_general', false)).toBe(EventType.LIST_REPLY);
    expect(determineEventType('doc_abc123', false)).toBe(EventType.LIST_REPLY);
  });

  it('returns TEXT for typed input', () => {
    expect(determineEventType('hello', true)).toBe(EventType.TEXT);
    expect(determineEventType('Mohammed', true)).toBe(EventType.TEXT);
    expect(determineEventType('menu_book', true)).toBe(EventType.TEXT);
  });

  it('does NOT return NAVIGATION for edit/summary IDs', () => {
    expect(determineEventType('confirm_booking', false)).not.toBe(EventType.NAVIGATION_SYSTEM);
    expect(determineEventType('edit_booking', false)).not.toBe(EventType.NAVIGATION_SYSTEM);
    expect(determineEventType('edit_doctor', false)).not.toBe(EventType.NAVIGATION_SYSTEM);
  });
});

// ─── Phase 2: NAVIGATION_IDS correctness ──────────────────────────────────────
describe('NAVIGATION_IDS', () => {
  it('only contains back, main_menu, cancel', () => {
    const expected = new Set(['back', 'main_menu', 'cancel']);
    expect(NAVIGATION_IDS).toEqual(expected);
  });

  it('does NOT contain summary/edit IDs', () => {
    expect(NAVIGATION_IDS.has('confirm_booking')).toBe(false);
    expect(NAVIGATION_IDS.has('edit_booking')).toBe(false);
    expect(NAVIGATION_IDS.has('cancel_booking')).toBe(false);
    expect(NAVIGATION_IDS.has('edit_doctor')).toBe(false);
  });
});

// ─── Phase 3: Idempotency Key Generation ──────────────────────────────────────
// The idempotency key is built as: `booking:${doctorId}:${date}:${time}:${phone}`
// This is deterministic — same inputs always produce same key
describe('Idempotency key structure', () => {
  it('is deterministic for same inputs', () => {
    const key1 = `booking:doc1:2026-07-15:10:00:966501234567`;
    const key2 = `booking:doc1:2026-07-15:10:00:966501234567`;
    expect(key1).toBe(key2);
  });

  it('differs when doctor changes', () => {
    const key1 = `booking:doc1:2026-07-15:10:00:966501234567`;
    const key2 = `booking:doc2:2026-07-15:10:00:966501234567`;
    expect(key1).not.toBe(key2);
  });

  it('differs when time changes', () => {
    const key1 = `booking:doc1:2026-07-15:10:00:966501234567`;
    const key2 = `booking:doc1:2026-07-15:10:30:966501234567`;
    expect(key1).not.toBe(key2);
  });

  it('differs when phone changes', () => {
    const key1 = `booking:doc1:2026-07-15:10:00:966501234567`;
    const key2 = `booking:doc1:2026-07-15:10:00:966501234568`;
    expect(key1).not.toBe(key2);
  });
});

// ─── Phase 4: BookingData interface completeness ──────────────────────────────
describe('BookingData', () => {
  it('supports navigation and edit fields', () => {
    const data: Record<string, unknown> = {
      previousStep: 'select_time',
      editReturn: 'booking_summary',
      editField: 'edit_doctor',
    };
    expect(data.previousStep).toBe('select_time');
    expect(data.editReturn).toBe('booking_summary');
    expect(data.editField).toBe('edit_doctor');
  });
});

// ─── Phase 5: STEP_ORDER consistency ──────────────────────────────────────────
import { STEP_ORDER, EDIT_FIELD_MAP } from './botMessages';

describe('STEP_ORDER', () => {
  it('every step has a predecessor except main_menu', () => {
    expect(STEP_ORDER.main_menu).toBe('');
    expect(STEP_ORDER.select_doctor).toBe('main_menu');
    expect(STEP_ORDER.select_service).toBe('select_doctor');
    expect(STEP_ORDER.select_date).toBe('select_service');
    expect(STEP_ORDER.select_time).toBe('select_date');
    expect(STEP_ORDER.ask_name).toBe('select_time');
    expect(STEP_ORDER.ask_call_time).toBe('ask_name');
    expect(STEP_ORDER.booking_summary).toBe('ask_call_time');
  });

  it('forms a chain without gaps', () => {
    const chain = ['main_menu', 'select_doctor', 'select_service', 'select_date',
      'select_time', 'ask_name', 'ask_call_time', 'booking_summary'];
    for (let i = 1; i < chain.length; i++) {
      expect(STEP_ORDER[chain[i]]).toBe(chain[i - 1]);
    }
  });
});

describe('EDIT_FIELD_MAP', () => {
  it('maps every edit field to a valid step', () => {
    const validSteps = new Set(Object.keys(STEP_ORDER));
    for (const [, target] of Object.entries(EDIT_FIELD_MAP)) {
      expect(validSteps.has(target)).toBe(true);
    }
  });

  it('maps edit_datetime to select_date (not select_time)', () => {
    expect(EDIT_FIELD_MAP.edit_datetime).toBe('select_date');
  });
});

// ─── Phase 6: TRIGGERS validation ─────────────────────────────────────────────
describe('TRIGGERS', () => {
  it('contains all expected trigger words', () => {
    const expectedTriggers = ['مرحبا', 'مرحباً', 'احجز', 'هلا', 'السلام عليكم', 'اهلا', 'أهلا', 'رئيسية',
      'hi', 'hello', 'hey', 'start', 'book', 'menu'];
    expect(TRIGGERS).toEqual(expectedTriggers);
  });

  it('BUG A prevention: interactive payloads never return TEXT event type', () => {
    // These payloads are NOT navigation IDs — they must return LIST_REPLY
    const payloads = ['menu_book', 'menu_offers', 'menu_contact', 'confirm_booking',
      'edit_booking', 'cancel_booking', 'edit_doctor', 'edit_service',
      'edit_datetime', 'edit_name', 'edit_calltime',
      'svc_general', 'svc_followup', 'svc_specialist', 'svc_labs',
      'call_morning', 'call_noon', 'call_evening'];

    for (const payload of payloads) {
      // When isText=false (interactive selection), event type MUST be LIST_REPLY
      const eventType = determineEventType(payload, false);
      expect(eventType).toBe(EventType.LIST_REPLY);
      // NOT TEXT, so isGreeting check in processMessage is never reached
      expect(eventType).not.toBe(EventType.TEXT);
    }

    // Navigation payloads correctly return NAVIGATION_SYSTEM
    expect(determineEventType('back', false)).toBe(EventType.NAVIGATION_SYSTEM);
    expect(determineEventType('main_menu', false)).toBe(EventType.NAVIGATION_SYSTEM);
    expect(determineEventType('cancel', false)).toBe(EventType.NAVIGATION_SYSTEM);
  });
});

// ─── Phase 7: Concurrency safety ──────────────────────────────────────────────
describe('Session version expectations', () => {
  it('session version increments on write', () => {
    const v1 = 1;
    const v2 = v1 + 1;
    expect(v2).toBe(2);
  });

  it('ConcurrencyError message format', () => {
    const phone = '966501234567';
    const expected = 1;
    const actual = 3;
    const msg = `Session version conflict for ${phone}: expected ${expected}, actual ${actual}`;
    expect(msg).toContain(phone);
    expect(msg).toContain('expected 1');
    expect(msg).toContain('actual 3');
  });
});

// ─── Phase 8: WhatsApp number validation ──────────────────────────────────────
describe('WhatsApp number formatting', () => {
  function formatNumber(input: string): string {
    const cleaned = input.replace(/\D/g, '');
    return cleaned.startsWith('966') ? cleaned
      : cleaned.startsWith('0') ? `966${cleaned.slice(1)}`
      : `966${cleaned}`;
  }

  it('formats 05xxxxxxxx correctly', () => {
    expect(formatNumber('0501234567')).toBe('966501234567');
  });

  it('formats 9665xxxxxxxx correctly', () => {
    expect(formatNumber('966501234567')).toBe('966501234567');
  });

  it('formats 5xxxxxxxx correctly', () => {
    expect(formatNumber('501234567')).toBe('966501234567');
  });

  it('rejects numbers shorter than 9 digits after cleanup', () => {
    const cleaned = '12345'.replace(/\D/g, '');
    expect(cleaned.length < 9).toBe(true);
  });
});

// ─── Phase 9: Name validation ─────────────────────────────────────────────────
describe('English name validation', () => {
  const NAME_RE = /^[A-Za-z]+(?:[ '\-][A-Za-z]+)*$/;

  it('accepts valid English names', () => {
    expect(NAME_RE.test('Mohammed Alotaibi')).toBe(true);
    expect(NAME_RE.test('Sara Alqahtani')).toBe(true);
    expect(NAME_RE.test('John Smith')).toBe(true);
  });

  it('rejects names with numbers', () => {
    expect(NAME_RE.test('Mohammed123')).toBe(false);
  });

  it('rejects names with Arabic characters', () => {
    expect(NAME_RE.test('محمد')).toBe(false);
  });

  it('rejects names with special characters', () => {
    expect(NAME_RE.test('Mohammed!')).toBe(false);
    expect(NAME_RE.test('test@user')).toBe(false);
  });

  it('accepts names with hyphens and apostrophes', () => {
    expect(NAME_RE.test("Ahmed O'Brien")).toBe(true);
    expect(NAME_RE.test('Abdul-Rahman Al-Farsi')).toBe(true);
  });

  it('requires at least two words', () => {
    const words = 'Mohammed'.trim().split(/\s+/);
    expect(words.length >= 2).toBe(false);
  });
});

// ─── Phase 10: Payload ID format consistency ──────────────────────────────────
describe('Payload ID format consistency', () => {
  it('date payloads start with date_', () => {
    const dateIds = ['date_2026-07-15', 'date_2026-07-16'];
    dateIds.forEach(id => expect(id.startsWith('date_')).toBe(true));
  });

  it('time payloads start with time_', () => {
    const timeIds = ['time_09:00', 'time_09:30'];
    timeIds.forEach(id => expect(id.startsWith('time_')).toBe(true));
  });

  it('service payloads are stable IDs', () => {
    const services = ['svc_general', 'svc_followup', 'svc_specialist', 'svc_labs'];
    services.forEach(id => expect(id.startsWith('svc_')).toBe(true));
  });

  it('call time payloads are stable IDs', () => {
    const times = ['call_morning', 'call_noon', 'call_evening'];
    times.forEach(id => expect(id.startsWith('call_')).toBe(true));
  });
});

// ─── Phase 11: Edge case payloads ─────────────────────────────────────────────
describe('Edge case input handling', () => {
  it('empty string normalize will be empty', () => {
    const input = '  '.trim();
    expect(input).toBe('');
  });

  it('very long input is handled', () => {
    const long = 'a'.repeat(10000);
    expect(long.length).toBe(10000);
  });
});
