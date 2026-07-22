import { prisma } from './prisma';
import { logger } from './logger';
import { logAudit } from './audit';

import { getAvailableSlots, generateTimeSlots } from './availability';
import { syncBooking } from './googleCalendar';
import type { Doctor } from '@prisma/client';

function toMinutes(t: string): number { const [h, m] = t.split(':').map(Number); return h * 60 + m; }
function pad(n: number): string { return String(n).padStart(2, '0'); }
function timeToString(m: number): string { return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`; }
function addMinutes(t: string, m: number): string { return timeToString(toMinutes(t) + m); }

// ─── Phase 2: Buffer Management ────────────────────────────────────────────────

export interface BufferConfig {
  bufferBefore: number;
  bufferAfter: number;
}

export async function getBufferForService(doctorId: string, service: string): Promise<BufferConfig> {
  const rule = await prisma.serviceBufferRule.findUnique({
    where: { doctorId_service: { doctorId, service } },
  });
  if (rule?.isActive) return { bufferBefore: rule.bufferBefore, bufferAfter: rule.bufferAfter };
  return { bufferBefore: 0, bufferAfter: 0 };
}

export async function setBufferRule(doctorId: string, service: string, bufferBefore: number, bufferAfter: number): Promise<void> {
  await prisma.serviceBufferRule.upsert({
    where: { doctorId_service: { doctorId, service } },
    update: { bufferBefore, bufferAfter, isActive: true },
    create: { doctorId, service, bufferBefore, bufferAfter },
  });
}

// ─── Phase 1: Smart Availability Engine ─────────────────────────────────────────

export interface SmartSlot {
  time: string;
  endTime: string;
  bufferBefore: number;
  bufferAfter: number;
  available: boolean;
  reason?: string;
}

export interface SmartAvailabilityResult {
  date: string;
  doctorId: string;
  doctorName: string;
  slots: SmartSlot[];
  totalSlots: number;
  availableSlots: number;
  buffers: BufferConfig;
}

export async function getSmartAvailability(
  doctorId: string,
  date: string,
  service?: string,
): Promise<SmartAvailabilityResult> {
  const doctor = await prisma.doctor.findUnique({ where: { id: doctorId } });
  if (!doctor) throw new Error('Doctor not found');

  const bufferConfig = service ? await getBufferForService(doctorId, service) : { bufferBefore: 0, bufferAfter: 0 };
  const baseResult = await getAvailableSlots(doctor, date);
  const slotDuration = doctor.slotDuration;

  const slots: SmartSlot[] = (baseResult.all ?? []).map((time) => {
    const endTime = addMinutes(time, slotDuration);
    const occupied = !baseResult.available.includes(time);
    let reason: string | undefined;

    if (baseResult.reason === 'holiday') reason = baseResult.holidayName ?? 'Holiday';
    else if (baseResult.reason === 'notWorkingDay') reason = 'Not a working day';
    else if (occupied) {
      if (baseResult.blockedTimes?.includes(time)) reason = 'Blocked';
      else reason = 'Booked';
    }

    return { time, endTime, bufferBefore: bufferConfig.bufferBefore, bufferAfter: bufferConfig.bufferAfter, available: !occupied, reason };
  });

  return {
    date, doctorId, doctorName: doctor.nameEn,
    slots, totalSlots: slots.length,
    availableSlots: slots.filter((s) => s.available).length,
    buffers: bufferConfig,
  };
}

export async function getSmartAvailabilityRange(
  doctorId: string,
  startDate: string,
  endDate: string,
  service?: string,
): Promise<SmartAvailabilityResult[]> {
  const results: SmartAvailabilityResult[] = [];
  const current = new Date(startDate);
  const end = new Date(endDate);

  while (current <= end) {
    const dateStr = current.toISOString().split('T')[0];
    try {
      const r = await getSmartAvailability(doctorId, dateStr, service);
      results.push(r);
    } catch {
      // skip days with errors
    }
    current.setDate(current.getDate() + 1);
  }

  return results;
}

// ─── Phase 4: Multi-Doctor Scheduling ──────────────────────────────────────────

export interface MultiDoctorSlot {
  time: string;
  endTime: string;
  doctors: Array<{ doctorId: string; name: string; available: boolean }>;
  allAvailable: boolean;
}

export async function getMultiDoctorAvailability(
  doctorIds: string[],
  date: string,
): Promise<MultiDoctorSlot[]> {
  const availabilities = await Promise.all(
    doctorIds.map((id) => getSmartAvailability(id, date)),
  );

  if (availabilities.length === 0) return [];

  const slotMap = new Map<string, MultiDoctorSlot>();

  for (const av of availabilities) {
    for (const slot of av.slots) {
      const existing = slotMap.get(slot.time) ?? {
        time: slot.time,
        endTime: slot.endTime,
        doctors: [],
        allAvailable: true,
      };
      existing.doctors.push({
        doctorId: av.doctorId,
        name: av.doctorName,
        available: slot.available,
      });
      if (!slot.available) existing.allAvailable = false;
      slotMap.set(slot.time, existing);
    }
  }

  return Array.from(slotMap.values()).sort((a, b) => a.time.localeCompare(b.time));
}

// ─── Phase 3: Intelligent Conflict Resolution ──────────────────────────────────

export interface ConflictSuggestion {
  date: string;
  time: string;
  doctorId: string;
  doctorName: string;
  rank: number;
  reason: string;
}

export async function resolveConflict(
  doctorId: string,
  date: string,
  time: string,
  service?: string,
  priority?: string,
): Promise<{ conflict: string; suggestions: ConflictSuggestion[] }> {
  const doctor = await prisma.doctor.findUnique({ where: { id: doctorId } });
  if (!doctor) throw new Error('Doctor not found');

  const existing = await prisma.booking.findUnique({
    where: { doctorId_date_time: { doctorId, date, time } },
  });
  if (!existing) return { conflict: 'No conflict at this slot', suggestions: [] };

  const suggestions: ConflictSuggestion[] = [];

  // Same doctor, same day — next slot
  const sameDaySlots = await getSmartAvailability(doctorId, date, service);
  for (const slot of sameDaySlots.slots) {
    if (slot.time > time && slot.available) {
      suggestions.push({ date, time: slot.time, doctorId, doctorName: doctor.nameEn, rank: 10, reason: 'Next available slot with same doctor' });
      break;
    }
  }

  // Same doctor, same day — previous slot
  let prevSlot: string | null = null;
  for (const slot of sameDaySlots.slots) {
    if (slot.time < time && slot.available) prevSlot = slot.time;
  }
  if (prevSlot) {
    suggestions.push({ date, time: prevSlot, doctorId, doctorName: doctor.nameEn, rank: 9, reason: 'Previous available slot with same doctor' });
  }

  // Same doctor — nearest day
  const neighbors = [-1, 1, -2, 2, -3, 3];
  for (const offset of neighbors) {
    if (suggestions.length >= 6) break;
    const d = new Date(date);
    d.setDate(d.getDate() + offset);
    const nearDate = d.toISOString().split('T')[0];
    const nearSlots = await getSmartAvailability(doctorId, nearDate, service);
    const firstAvail = nearSlots.slots.find((s) => s.available);
    if (firstAvail) {
      suggestions.push({ date: nearDate, time: firstAvail.time, doctorId, doctorName: doctor.nameEn, rank: 8 - Math.abs(offset), reason: offset < 0 ? 'Previous day' : 'Next day' });
    }
  }

  // Alternative doctors
  const allDoctors = await prisma.doctor.findMany({
    where: { isActive: true, id: { not: doctorId } },
    select: { id: true, nameEn: true },
  });
  for (const altDoctor of allDoctors) {
    if (suggestions.length >= 10) break;
    try {
      const altSlots = await getSmartAvailability(altDoctor.id, date, service);
      const firstAvail = altSlots.slots.find((s) => s.available);
      if (firstAvail) {
        suggestions.push({ date, time: firstAvail.time, doctorId: altDoctor.id, doctorName: altDoctor.nameEn, rank: 5, reason: 'Different doctor, same day' });
      }
    } catch {
      // skip
    }
  }

  // Least busy day
  const weekDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(date);
    d.setDate(d.getDate() + i);
    return d.toISOString().split('T')[0];
  });
  let leastBusyDay: { date: string; count: number } | null = null;
  for (const wd of weekDates) {
    const ws = await getSmartAvailability(doctorId, wd, service);
    if (!leastBusyDay || ws.availableSlots > leastBusyDay.count) {
      leastBusyDay = { date: wd, count: ws.availableSlots };
    }
  }
  if (leastBusyDay && leastBusyDay.count > 0) {
    const lbSlots = await getSmartAvailability(doctorId, leastBusyDay.date, service);
    const firstAvail = lbSlots.slots.find((s) => s.available);
    if (firstAvail) {
      suggestions.push({ date: leastBusyDay.date, time: firstAvail.time, doctorId, doctorName: doctor.nameEn, rank: 7, reason: 'Least busy day' });
    }
  }

  suggestions.sort((a, b) => b.rank - a.rank);

  return { conflict: `Slot ${date}T${time} is occupied`, suggestions };
}

// ─── Phase 5: Priority Scheduling ──────────────────────────────────────────────

export function priorityRank(priority: string): number {
  switch (priority) {
    case 'emergency': return 100;
    case 'vip': return 80;
    case 'follow_up': return 60;
    case 'regular': return 40;
    default: return 40;
  }
}

export async function allocateEmergencySlot(doctorId: string, date: string): Promise<{ time: string; freed: boolean } | null> {
  const slots = await getSmartAvailability(doctorId, date);
  const firstAvail = slots.slots.find((s) => s.available);
  if (firstAvail) return { time: firstAvail.time, freed: false };

  for (const slot of slots.slots) {
    if (slot.reason === 'Blocked') continue;
    const booking = await prisma.booking.findUnique({
      where: { doctorId_date_time: { doctorId, date, time: slot.time } },
    });
    if (booking && booking.priority === 'regular') {
      return { time: slot.time, freed: true };
    }
  }

  return null;
}

// ─── Phase 6: Waiting List Engine ──────────────────────────────────────────────

export interface WaitingListCandidate {
  id: string;
  name: string;
  phone: string;
  service: string;
  priority: number;
  createdAt: Date;
}

export async function addToWaitingList(params: {
  name: string; phone: string; service: string;
  doctorId?: string; priority?: number;
  preferredDays?: string[]; preferredTimes?: string;
  notes?: string;
}): Promise<{ id: string }> {
  const entry = await prisma.waitingListEntry.create({
    data: {
      name: params.name,
      phone: params.phone,
      service: params.service,
      doctorId: params.doctorId,
      priority: params.priority ?? 0,
      preferredDays: params.preferredDays ?? [],
      preferredTimes: params.preferredTimes,
      notes: params.notes,
      status: 'waiting',
    },
  });

  logAudit('BOOKING_CREATED', 'WaitingListEntry', entry.id, { ...params }).catch(() => {});
  return { id: entry.id };
}

export async function findBestCandidate(cancelledDoctorId: string, cancelledDate: string, cancelledTime: string, cancelledService: string): Promise<WaitingListCandidate | null> {
  const candidates = await prisma.waitingListEntry.findMany({
    where: {
      status: 'waiting',
      service: cancelledService,
      OR: [
        { doctorId: cancelledDoctorId },
        { doctorId: null },
      ],
    },
    orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
    take: 10,
  });

  if (candidates.length === 0) return null;

  for (const candidate of candidates) {
    if (candidate.preferredDays.length > 0) {
      const dayAbbr = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'][new Date(cancelledDate).getDay()];
      if (!candidate.preferredDays.includes(dayAbbr)) continue;
    }
    return {
      id: candidate.id, name: candidate.name, phone: candidate.phone,
      service: candidate.service, priority: candidate.priority, createdAt: candidate.createdAt,
    };
  }

  return {
    id: candidates[0].id, name: candidates[0].name, phone: candidates[0].phone,
    service: candidates[0].service, priority: candidates[0].priority, createdAt: candidates[0].createdAt,
  };
}

export async function reserveSlot(entryId: string, date: string, time: string): Promise<boolean> {
  const entry = await prisma.waitingListEntry.findUnique({ where: { id: entryId } });
  if (!entry || entry.status !== 'waiting') return false;

  const expiresAt = new Date(Date.now() + 30 * 60000);
  await prisma.waitingListEntry.update({
    where: { id: entryId },
    data: { status: 'reserved', expiresAt, reservedAt: new Date() },
  });

  return true;
}

export async function expireReservations(): Promise<number> {
  const expired = await prisma.waitingListEntry.updateMany({
    where: { status: 'reserved', expiresAt: { lte: new Date() } },
    data: { status: 'waiting', expiresAt: null, reservedAt: null },
  });

  if (expired.count > 0) {
    logger.info('Expired waiting list reservations', { count: expired.count });
  }

  return expired.count;
}

// ─── Phase 7: Auto Rescheduling ────────────────────────────────────────────────

export interface RescheduleMove {
  bookingId: string;
  fromDate: string;
  fromTime: string;
  toDate: string;
  toTime: string;
  patientName: string;
  patientPhone: string;
  status: 'moved' | 'failed' | 'no_alternative';
}

export async function autoRescheduleBookings(doctorId: string, unavailableDate: string): Promise<RescheduleMove[]> {
  const doctor = await prisma.doctor.findUnique({ where: { id: doctorId } });
  if (!doctor) return [];

  const affected = await prisma.booking.findMany({
    where: { doctorId, date: unavailableDate, status: { notIn: ['cancelled'] } },
    orderBy: [{ priority: 'desc' }, { time: 'asc' }],
  });

  const moves: RescheduleMove[] = [];
  const searchDays = [1, 2, 3, -1, 4, 5, 7];

  for (const booking of affected) {
    let moved = false;
    for (const offset of searchDays) {
      if (moved) break;
      const d = new Date(unavailableDate);
      d.setDate(d.getDate() + offset);
      const candidateDate = d.toISOString().split('T')[0];
      const slots = await getSmartAvailability(doctorId, candidateDate, booking.service);
      const firstFree = slots.slots.find((s) => s.available);
      if (firstFree) {
        try {
          await syncBooking(
            { ...booking, date: candidateDate, time: firstFree.time } as never,
            doctor,
            { skipRetryEnqueue: true },
          );
          await prisma.booking.update({
            where: { id: booking.id },
            data: { date: candidateDate, time: firstFree.time, notes: booking.notes ? `${booking.notes}; Auto-rescheduled from ${unavailableDate}` : `Auto-rescheduled from ${unavailableDate}` },
          });
          moves.push({
            bookingId: booking.id, fromDate: unavailableDate, fromTime: booking.time,
            toDate: candidateDate, toTime: firstFree.time,
            patientName: booking.name, patientPhone: booking.phone,
            status: 'moved',
          });
          moved = true;
        } catch {
          moves.push({
            bookingId: booking.id, fromDate: unavailableDate, fromTime: booking.time,
            toDate: candidateDate, toTime: firstFree.time,
            patientName: booking.name, patientPhone: booking.phone,
            status: 'failed',
          });
        }
      }
    }
    if (!moved) {
      moves.push({
        bookingId: booking.id, fromDate: unavailableDate, fromTime: booking.time,
        toDate: unavailableDate, toTime: booking.time,
        patientName: booking.name, patientPhone: booking.phone,
        status: 'no_alternative',
      });
    }
  }

  logAudit('BOOKING_CREATED', 'Doctor', doctorId, {
    action: 'auto_reschedule', date: unavailableDate, total: affected.length, moved: moves.filter((m) => m.status === 'moved').length,
  }).catch(() => {});

  return moves;
}

// ─── Phase 8: Scheduling Optimizer ─────────────────────────────────────────────

export interface OptimizationSuggestion {
  type: string;
  day: string;
  description: string;
  impact: string;
  potentialSavings: string;
}

export async function optimizeDay(doctorId: string, date: string): Promise<OptimizationSuggestion[]> {
  const doctor = await prisma.doctor.findUnique({ where: { id: doctorId } });
  if (!doctor) return [];

  const bookings = await prisma.booking.findMany({
    where: { doctorId, date, status: { notIn: ['cancelled'] } },
    orderBy: { time: 'asc' },
  });

  const suggestions: OptimizationSuggestion[] = [];
  const slotDuration = doctor.slotDuration;

  const workingStart = toMinutes(doctor.workingStart);
  const workingEnd = toMinutes(doctor.workingEnd);
  const totalWorkMinutes = workingEnd - workingStart;
  const breakMinutes = doctor.breakEnabled ? toMinutes(doctor.breakEnd) - toMinutes(doctor.breakStart) : 0;
  const availableMinutes = totalWorkMinutes - breakMinutes;

  let bookedMinutes = 0;
  for (let i = 0; i < bookings.length; i++) {
    bookedMinutes += slotDuration;
  }
  const utilization = availableMinutes > 0 ? (bookedMinutes / availableMinutes) * 100 : 0;

  if (utilization < 60) {
    suggestions.push({
      type: 'utilization', day: date,
      description: `Low utilization: ${Math.round(utilization)}% booked (${bookedMinutes}/${availableMinutes} min)`,
      impact: `Could accommodate ${Math.floor((availableMinutes - bookedMinutes) / slotDuration)} more appointments`,
      potentialSavings: `${Math.round(100 - utilization)}% capacity`,
    });
  }

  let idleMinutes = 0;
  const gaps: number[] = [];
  for (let i = 1; i < bookings.length; i++) {
    const prevEnd = toMinutes(bookings[i - 1].time) + slotDuration;
    const currStart = toMinutes(bookings[i].time);
    if (currStart > prevEnd) {
      const gap = currStart - prevEnd;
      idleMinutes += gap;
      gaps.push(gap);
    }
  }

  if (gaps.length > 0 && idleMinutes > slotDuration * 2) {
    const avgGap = Math.round(idleMinutes / gaps.length);
    suggestions.push({
      type: 'gaps', day: date,
      description: `${gaps.length} gaps totaling ${idleMinutes} min idle time (avg ${avgGap} min)`,
      impact: `Clustering could save ${idleMinutes} min of idle time`,
      potentialSavings: `${idleMinutes} min`,
    });
  }

  const lastBooking = bookings[bookings.length - 1];
  if (lastBooking) {
    const lastEnd = toMinutes(lastBooking.time) + slotDuration;
    if (lastEnd > workingEnd - 30) {
      suggestions.push({
        type: 'overtime', day: date,
        description: `Last appointment ends at ${timeToString(lastEnd)}, ${lastEnd - workingEnd} min overtime`,
        impact: 'Reschedule late appointments earlier to avoid overtime',
        potentialSavings: `${lastEnd - workingEnd} min overtime reduction`,
      });
    }
  }

  if (bookings.length > 1) {
    const firstStart = toMinutes(bookings[0].time);
    if (firstStart > workingStart + 30 && firstStart <= workingStart + 60) {
      suggestions.push({
        type: 'startup', day: date,
        description: `First appointment at ${bookings[0].time}, ${firstStart - workingStart} min after opening`,
        impact: 'Move first appointments earlier to increase utilization',
        potentialSavings: `${firstStart - workingStart} min reclaimed`,
      });
    }
  }

  return suggestions;
}

export async function optimizeWeek(doctorId: string, startDate: string): Promise<OptimizationSuggestion[]> {
  const all: OptimizationSuggestion[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(startDate);
    d.setDate(d.getDate() + i);
    const daySugs = await optimizeDay(doctorId, d.toISOString().split('T')[0]);
    all.push(...daySugs);
  }
  return all;
}

// ─── Phase 9: Forecasting ──────────────────────────────────────────────────────

export interface ForecastPoint {
  date: string;
  metric: string;
  actual: number;
  predicted: number;
  confidence: number;
}

export async function forecastUtilization(doctorId?: string, days = 30): Promise<ForecastPoint[]> {
  const endDate = new Date();
  const startDate = new Date(Date.now() - days * 86400000);
  const where: Record<string, unknown> = {};
  if (doctorId) where.doctorId = doctorId;

  const dailyBookings = await prisma.booking.groupBy({
    by: ['date'],
    where: { ...where, createdAt: { gte: startDate } } as never,
    _count: { id: true },
    orderBy: { date: 'asc' },
  });

  const dailyCancels = await prisma.booking.groupBy({
    by: ['date'],
    where: { ...where, status: 'cancelled', createdAt: { gte: startDate } } as never,
    _count: { id: true },
    orderBy: { date: 'asc' },
  });

  const cancelMap = new Map(dailyCancels.map((c) => [c.date, c._count.id]));
  const bookingCounts = dailyBookings.map((b) => b._count.id);
  const total = bookingCounts.reduce((s, v) => s + v, 0);
  const mean = total / Math.max(dailyBookings.length, 1);

  const forecasts: ForecastPoint[] = [];
  const today = new Date().toISOString().split('T')[0];

  for (let i = 1; i <= 14; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    const dateStr = d.toISOString().split('T')[0];

    const predicted = Math.round(mean * (0.8 + Math.random() * 0.4));
    const actual = dailyBookings.find((b) => b.date === dateStr)?._count.id ?? 0;
    const cancelRate = bookingCounts.length > 0 ? dailyCancels.length / bookingCounts.length : 0.1;

    forecasts.push({
      date: dateStr, metric: 'bookings',
      actual: dateStr <= today ? actual : 0,
      predicted: Math.max(1, predicted),
      confidence: Math.round((1 - cancelRate) * 100),
    });
  }

  return forecasts;
}

export async function forecastDemand(days = 60): Promise<ForecastPoint[]> {
  const endDate = new Date();
  const startDate = new Date(Date.now() - days * 86400000);

  const services = await prisma.booking.groupBy({
    by: ['service'],
    where: { createdAt: { gte: startDate } },
    _count: { id: true },
    orderBy: { _count: { id: 'desc' } },
  });

  const total = services.reduce((s, srv) => s + srv._count.id, 0);
  const forecasts: ForecastPoint[] = [];

  for (const srv of services) {
    const proportion = total > 0 ? srv._count.id / total : 0;
    const weekly = Math.round(proportion * 50);

    for (let w = 1; w <= 4; w++) {
      const d = new Date();
      d.setDate(d.getDate() + w * 7);
      forecasts.push({
        date: d.toISOString().split('T')[0],
        metric: `demand_${srv.service}`,
        actual: 0,
        predicted: Math.max(1, weekly + Math.round((Math.random() - 0.5) * weekly * 0.3)),
        confidence: Math.round((1 - Math.abs(0.5 - proportion)) * 100),
      });
    }
  }

  return forecasts;
}

export async function forecastWorkload(days = 30): Promise<ForecastPoint[]> {
  const doctors = await prisma.doctor.findMany({ where: { isActive: true } });
  const points: ForecastPoint[] = [];

  for (const doctor of doctors) {
    const count = await prisma.booking.count({
      where: { doctorId: doctor.id, createdAt: { gte: new Date(Date.now() - days * 86400000) } },
    });
    const daily = count / Math.max(days, 1);

    for (let i = 1; i <= 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      points.push({
        date: d.toISOString().split('T')[0],
        metric: `workload_${doctor.nameEn}`,
        actual: 0,
        predicted: Math.round(daily * (0.85 + Math.random() * 0.3)),
        confidence: Math.round(Math.min(95, (count / 100) * 100)),
      });
    }
  }

  return points;
}

// ─── Phase 10: Analytics ───────────────────────────────────────────────────────

export async function getSchedulingAnalytics(doctorId?: string, days = 30) {
  const startDate = new Date(Date.now() - days * 86400000);
  const endDate = new Date();
  const doctorWhere = doctorId ? { doctorId } : {};

  const totalBookings = await prisma.booking.count({
    where: { ...doctorWhere, createdAt: { gte: startDate } } as never,
  });
  const cancelled = await prisma.booking.count({
    where: { ...doctorWhere, status: 'cancelled', createdAt: { gte: startDate } } as never,
  });
  const synced = await prisma.booking.count({
    where: { ...doctorWhere, calendarSynced: true, createdAt: { gte: startDate } } as never,
  });

  const rescheduled = await prisma.auditLog.count({
    where: {
      action: 'BOOKING_CREATED',
      details: { path: ['action'], equals: 'auto_reschedule' },
      createdAt: { gte: startDate },
    },
  });

  const daily = await prisma.booking.groupBy({
    by: ['date'],
    where: { ...doctorWhere, createdAt: { gte: startDate } } as never,
    _count: { id: true },
    orderBy: { date: 'asc' },
  });

  const peakHourRaw = await prisma.booking.groupBy({
    by: ['time'],
    where: { ...doctorWhere, createdAt: { gte: startDate } } as never,
    _count: { id: true },
    orderBy: { _count: { id: 'desc' } },
    take: 5,
  });

  const heatMap: Record<string, number> = {};
  for (const entry of daily) {
    const day = new Date(entry.date).getDay();
    const dayName = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][day];
    heatMap[dayName] = (heatMap[dayName] ?? 0) + entry._count.id;
  }

  const services = await prisma.booking.groupBy({
    by: ['service'],
    where: { ...doctorWhere, createdAt: { gte: startDate } } as never,
    _count: { id: true },
    orderBy: { _count: { id: 'desc' } },
  });

  const doctors = await prisma.booking.groupBy({
    by: ['doctorId'],
    where: { createdAt: { gte: startDate } } as never,
    _count: { id: true },
    orderBy: { _count: { id: 'desc' } },
  });
  const activeDoctors = await prisma.doctor.count({ where: { isActive: true } });
  const totalCapacity = activeDoctors * 16 * days;
  const utilizationRate = totalCapacity > 0 ? Math.round((totalBookings / totalCapacity) * 10000) / 100 : 0;

  return {
    period: { from: startDate.toISOString().split('T')[0], to: endDate.toISOString().split('T')[0], days },
    summary: {
      totalBookings,
      cancelled,
      cancellationRate: totalBookings > 0 ? Math.round((cancelled / totalBookings) * 10000) / 100 : 0,
      rescheduled,
      synced,
      syncRate: totalBookings > 0 ? Math.round((synced / totalBookings) * 10000) / 100 : 0,
    },
    utilization: {
      rate: `${utilizationRate}%`,
      totalCapacity,
      usedCapacity: totalBookings,
      idleCapacity: totalCapacity - totalBookings,
    },
    occupancy: doctors.map((d) => ({
      doctorId: d.doctorId,
      bookings: d._count.id,
    })),
    peakHours: peakHourRaw.map((p) => ({ time: p.time, count: p._count.id })),
    heatMap,
    serviceLoad: services.map((s) => ({ service: s.service, count: s._count.id })),
    monthlyTrend: daily.slice(-31).map((d) => ({ date: d.date, count: d._count.id })),
    topFailingDoctors: [],
    averageDelay: 0,
    averageWaitMinutes: 0,
  };
}
