import { describe, it, expect } from 'vitest';
import { toArabicDigit, formatTimeForAr, formatTimeForEn } from './availability';

// ─── toArabicDigit ────────────────────────────────────────────────────────────
describe('toArabicDigit', () => {
  it('converts 0 to Arabic-Indic zero', () => {
    expect(toArabicDigit(0)).toBe('٠');
  });

  it('converts 5 to Arabic-Indic five', () => {
    expect(toArabicDigit(5)).toBe('٥');
  });

  it('converts 9 to Arabic-Indic nine', () => {
    expect(toArabicDigit(9)).toBe('٩');
  });

  it('converts 30 to Arabic-Indic digits', () => {
    expect(toArabicDigit(30)).toBe('٣٠');
  });

  it('converts 12 to Arabic-Indic digits', () => {
    expect(toArabicDigit(12)).toBe('١٢');
  });

  it('converts 0 with leading zeros', () => {
    expect(toArabicDigit(0)).toBe('٠');
    expect(toArabicDigit(5)).not.toBe('٠٥');
  });
});

// ─── formatTimeForAr ─────────────────────────────────────────────────────────
describe('formatTimeForAr', () => {
  it('formats 09:00 as morning time', () => {
    expect(formatTimeForAr('09:00')).toBe('٩:٠٠ صباحاً');
  });

  it('formats 17:30 as evening time', () => {
    expect(formatTimeForAr('17:30')).toBe('٥:٣٠ مساءً');
  });

  it('formats 12:00 noon', () => {
    expect(formatTimeForAr('12:00')).toBe('١٢:٠٠ مساءً');
  });

  it('formats 00:00 midnight', () => {
    expect(formatTimeForAr('00:00')).toBe('١٢:٠٠ صباحاً');
  });

  it('formats 01:05 with leading minutes', () => {
    expect(formatTimeForAr('01:05')).toBe('١:٠٥ صباحاً');
  });

  it('formats 13:01 as 1:01 PM', () => {
    expect(formatTimeForAr('13:01')).toBe('١:٠١ مساءً');
  });

  it('formats 23:59 as 11:59 PM', () => {
    expect(formatTimeForAr('23:59')).toBe('١١:٥٩ مساءً');
  });
});

// ─── formatTimeForEn ─────────────────────────────────────────────────────────
describe('formatTimeForEn', () => {
  it('formats 09:00 as 9:00 AM', () => {
    expect(formatTimeForEn('09:00')).toBe('9:00 AM');
  });

  it('formats 17:30 as 5:30 PM', () => {
    expect(formatTimeForEn('17:30')).toBe('5:30 PM');
  });

  it('formats 12:00 noon', () => {
    expect(formatTimeForEn('12:00')).toBe('12:00 PM');
  });

  it('formats 00:00 midnight', () => {
    expect(formatTimeForEn('00:00')).toBe('12:00 AM');
  });

  it('formats 01:05 with leading zero minutes', () => {
    expect(formatTimeForEn('01:05')).toBe('1:05 AM');
  });

  it('formats 13:01 as 1:01 PM', () => {
    expect(formatTimeForEn('13:01')).toBe('1:01 PM');
  });

  it('formats 23:59 as 11:59 PM', () => {
    expect(formatTimeForEn('23:59')).toBe('11:59 PM');
  });
});
