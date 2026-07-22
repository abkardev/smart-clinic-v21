import { prisma } from './prisma';
import { logger } from './logger';

interface RRuleParams {
  freq: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
  interval: number;
  byDay?: string[];
  byMonthDay?: number[];
  count?: number;
  until?: string;
}

function parseRRule(rrule: string): RRuleParams | null {
  try {
    const parts = rrule.split(';');
    const params: Partial<RRuleParams> = { freq: 'WEEKLY', interval: 1 };

    for (const part of parts) {
      const [key, rawValue] = part.split('=');
      const value = rawValue ?? '';

      switch (key) {
        case 'FREQ':
          params.freq = value as RRuleParams['freq'];
          break;
        case 'INTERVAL':
          params.interval = parseInt(value, 10) || 1;
          break;
        case 'BYDAY':
          params.byDay = value.split(',');
          break;
        case 'BYMONTHDAY':
          params.byMonthDay = value.split(',').map(Number);
          break;
        case 'COUNT':
          params.count = parseInt(value, 10) || undefined;
          break;
        case 'UNTIL':
          params.until = value;
          break;
      }
    }

    return params as RRuleParams;
  } catch {
    return null;
  }
}

function getDayOfWeek(date: Date): string {
  const days = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
  return days[date.getDay()];
}

export function expandRRule(
  rrule: string,
  startTime: string,
  endTime: string,
  activeFrom?: Date | null,
  activeUntil?: Date | null,
  maxOccurrences = 365,
): Array<{ date: string; start: string; end: string }> {
  const params = parseRRule(rrule);
  if (!params) return [];

  const from = activeFrom ?? new Date();
  const until = activeUntil ?? new Date(from.getTime() + 365 * 24 * 60 * 60 * 1000);

  const results: Array<{ date: string; start: string; end: string }> = [];
  const current = new Date(from);
  let occurrenceCount = 0;

  while (current <= until) {
    if (params.byDay) {
      const dayName = getDayOfWeek(current);
      if (!params.byDay.includes(dayName)) {
        current.setDate(current.getDate() + 1);
        continue;
      }
    }

    if (params.byMonthDay && !params.byMonthDay.includes(current.getDate())) {
      current.setDate(current.getDate() + 1);
      continue;
    }

    const dateStr = current.toISOString().split('T')[0];

    if (params.count && occurrenceCount >= params.count) break;
    if (params.until && dateStr > params.until) break;

    results.push({ date: dateStr, start: startTime, end: endTime });
    occurrenceCount++;

    switch (params.freq) {
      case 'DAILY':
        current.setDate(current.getDate() + params.interval);
        break;
      case 'WEEKLY':
        current.setDate(current.getDate() + 7 * params.interval);
        break;
      case 'MONTHLY':
        current.setMonth(current.getMonth() + params.interval);
        break;
      case 'YEARLY':
        current.setFullYear(current.getFullYear() + params.interval);
        break;
    }
  }

  return results;
}

export async function expandRecurringSlots(doctorId: string): Promise<number> {
  const slots = await prisma.recurringBlockedSlot.findMany({ where: { doctorId } });
  let expanded = 0;

  for (const slot of slots) {
    const occurrences = expandRRule(slot.rrule, slot.startTime, slot.endTime, slot.activeFrom, slot.activeUntil);
    const dateStr = new Date().toISOString().split('T')[0];

    for (const occ of occurrences) {
      if (occ.date < dateStr) continue;

      const existing = await prisma.blockedSlot.findFirst({
        where: {
          doctorId,
          date: occ.date,
          time: occ.start,
          recurringSlotId: slot.id,
        },
      });
      if (!existing) {
        await prisma.blockedSlot.create({
          data: {
            doctorId,
            date: occ.date,
            time: occ.start,
            reason: slot.title ?? slot.reason,
            isWholeDay: slot.isWholeDay,
            syncedToGoogle: slot.syncedToGoogle,
            googleEventId: slot.googleEventId,
            recurringSlotId: slot.id,
            blockingSource: 'recurring_expansion',
          },
        });
        expanded++;
      }
    }
  }

  if (expanded > 0) {
    logger.info('Expanded recurring slots', { doctorId, expanded });
  }

  return expanded;
}
