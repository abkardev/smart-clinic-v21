import { prisma } from './prisma';
import { getAvailableSlots, listUpcomingDays, formatTimeForAr, formatTimeForEn, DayStatus, findNearestAppointment, BOOKING_WINDOW_DAYS } from './availability';
import {
  MSG, CALL_TIMES, SERVICES_BILINGUAL, TRIGGERS,
  BookingData, STEP_ORDER, NAVIGATION_IDS, EDIT_FIELD_MAP,
} from './botMessages';
import { BookingSource } from '@prisma/client';
import { logger } from './logger';
import { logAudit, AuditAction } from './audit';
import {
  getSession, setSession, clearSession,
  ConcurrencyError, SessionResult,
} from './sessionManager';
import { createBookingIdempotent } from './bookingLock';
import { trackEvent } from './conversationTracker';
import { metrics } from './metrics';
import { waRowTitle, waRowDescription, waSectionTitle, waButtonLabel, waHeader } from './metaValidation';

export interface BotAdapter {
  sendText(to: string, text: string): Promise<void>;
  sendList(to: string, header: string, body: string, button: string, sections: ListSection[]): Promise<void>;
}

export interface ListSection {
  title: string;
  rows: { id: string; title: string; description?: string }[];
}

export interface MessageHandler {
  handle(
    userId: string, input: string, data: BookingData,
    adapter: BotAdapter, source: BookingSource,
    correlationId: string,
  ): Promise<string | undefined>;
}

const SESSION_TTL_MS = 30 * 60 * 1000;
const PATIENT_NAME_RE = /^[\p{L}]+(?:[ '\-][\p{L}]+)*$/u;
const FALLBACK_TTL_MS = 10 * 60 * 1000;
const FF_EDIT_FLOW_FIX = process.env.FF_EDIT_FLOW_FIX === 'true';

export async function registerFallbackRows(userId: string, rows: Array<{ id: string }>): Promise<void> {
  if (rows.length === 0) return;
  const expiresAt = new Date(Date.now() + FALLBACK_TTL_MS);
  await prisma.fallbackMapping.upsert({
    where: { userId },
    create: { userId, rows: rows as never, expiresAt },
    update: { rows: rows as never, expiresAt },
  }).catch(() => { /* non-fatal */ });
}

async function resolveFallbackInput(userId: string, input: string): Promise<string | null> {
  const entry = await prisma.fallbackMapping.findUnique({ where: { userId } });
  if (!entry) return null;
  if (entry.expiresAt < new Date()) {
    await prisma.fallbackMapping.delete({ where: { userId } }).catch(() => {});
    return null;
  }
  const rows = entry.rows as Array<{ id: string }>;
  const num = parseInt(input, 10);
  if (isNaN(num) || num < 1 || num > rows.length) return null;
  await prisma.fallbackMapping.delete({ where: { userId } }).catch(() => {});
  return rows[num - 1].id;
}

// ─── Row builder (single-language titles for Meta limits) ───────────────────
function rowAr(id: string, titleAr: string, descEn?: string): { id: string; title: string; description?: string } {
  return { id, title: titleAr, ...(descEn ? { description: descEn } : {}) };
}

function navRow(id: string, labelAr: string, labelEn: string) {
  return { id, title: labelAr, description: labelEn };
}

function isValidPatientName(input: string): boolean {
  const trimmed = input.trim();
  return trimmed.length >= 2 && PATIENT_NAME_RE.test(trimmed) && trimmed.split(/\s+/).length >= 1;
}

function bi(ar: string, en: string): string {
  return `${ar}\n— — —\n${en}`;
}

export enum EventType {
  TEXT, LIST_REPLY, BUTTON_REPLY, POSTBACK, NAVIGATION_SYSTEM, UNKNOWN,
}

export function determineEventType(input: string, isText: boolean): EventType {
  if (NAVIGATION_IDS.has(input)) return EventType.NAVIGATION_SYSTEM;
  if (!isText) return EventType.LIST_REPLY;
  return EventType.TEXT;
}

function navigationSection(): ListSection {
  return {
    title: waSectionTitle('التنقل', 'Navigation'),
    rows: [
      navRow('back', '⬅️ رجوع', 'Back'),
      navRow('main_menu', '🏠 القائمة الرئيسية', 'Main Menu'),
      navRow('cancel', '❌ إلغاء', 'Cancel'),
    ],
  };
}

async function sendTextWithNav(userId: string, text: string, adapter: BotAdapter, cid: string): Promise<void> {
  await adapter.sendText(userId, text);
  try {
    await adapter.sendList(userId, waHeader(bi('التنقل', 'Navigation')), bi('اختر من القائمة:', 'Choose from the list:'), waButtonLabel('اختر', 'Choose'), [navigationSection()]);
  } catch (err) {
    logger.warn('[Nav] navigation list failed, continuing', { error: String(err), correlationId: cid });
  }
}

async function sendMainMenu(userId: string, adapter: BotAdapter) {
  const { bookAr, bookEn, offersAr, offersEn, contactAr, contactEn, locationAr, locationEn, myBookingAr, myBookingEn } = MSG.menuOptions;
  return adapter.sendList(userId, '🏥 SmartClinic', MSG.welcome(), waButtonLabel('اختر', 'Choose'), [{
    title: waSectionTitle('القائمة', 'Menu'),
    rows: [
      rowAr('menu_book', bookAr, bookEn),
      rowAr('menu_my_booking', myBookingAr, myBookingEn),
      rowAr('menu_offers', offersAr, offersEn),
      rowAr('menu_location', locationAr, locationEn),
      rowAr('menu_contact', contactAr, contactEn),
    ],
  }]);
}

async function sendDoctorsList(userId: string, adapter: BotAdapter) {
  const doctors = await prisma.doctor.findMany({ where: { isActive: true } });
  if (!doctors.length) return adapter.sendText(userId, MSG.noDoctors);
  return adapter.sendList(userId, waHeader(bi('اختر الطبيب', 'Choose Doctor')), MSG.selectDoctor, waButtonLabel('اختر', 'Choose'), [
    { title: waSectionTitle('الأطباء', 'Doctors'), rows: doctors.map(d => ({
      id: d.id,
      title: waRowTitle(`د. ${d.nameAr || d.nameEn}`, `Dr. ${d.nameEn || d.nameAr}`),
      description: waRowDescription(d.specialtyAr || (d.nameAr || ''), d.specialtyEn || (d.nameEn || '')),
    })) },
    navigationSection(),
  ]);
}

async function sendServicesList(userId: string, data: BookingData, adapter: BotAdapter) {
  return adapter.sendList(userId, waHeader(`د. ${data.doctorNameAr} / Dr. ${data.doctorNameEn}`), MSG.selectService(data.doctorNameAr!, data.doctorNameEn!), waButtonLabel('اختر', 'Choose'), [
    { title: waSectionTitle('الخدمات', 'Services'), rows: SERVICES_BILINGUAL.map(s => rowAr(s.id, s.ar, s.en)) },
    navigationSection(),
  ]);
}

// ─── Presentation helpers (DOW labels — moved from availability.ts) ──────────

const DOW_LABELS_AR = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const DOW_LABELS_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function getDayLabelAr(d: { date: string; isToday: boolean; isTomorrow: boolean }): string {
  if (d.isToday) return 'اليوم';
  if (d.isTomorrow) return 'غداً';
  const date = new Date(d.date);
  return `${DOW_LABELS_AR[date.getDay()]} ${date.getDate()} ${date.toLocaleDateString('ar-SA', { month: 'long' })}`;
}

function getDayLabelEn(d: { date: string; isToday: boolean; isTomorrow: boolean }): string {
  if (d.isToday) return 'Today';
  if (d.isTomorrow) return 'Tomorrow';
  const date = new Date(d.date);
  return `${DOW_LABELS_EN[date.getDay()]}, ${date.toLocaleDateString('en-US', { month: 'short' })} ${date.getDate()}`;
}

const DAY_STATUS_TEXT_AR: Record<DayStatus, string> = {
  [DayStatus.AVAILABLE]: '',
  [DayStatus.FULLY_BOOKED]: 'ممتلئ',
  [DayStatus.HOLIDAY]: 'إجازة',
  [DayStatus.BLOCKED]: 'مغلق',
  [DayStatus.NOT_WORKING_DAY]: 'لا يعمل',
};

const DAY_STATUS_TEXT_EN: Record<DayStatus, string> = {
  [DayStatus.AVAILABLE]: '',
  [DayStatus.FULLY_BOOKED]: 'Fully Booked',
  [DayStatus.HOLIDAY]: 'Day Off',
  [DayStatus.BLOCKED]: 'Blocked',
  [DayStatus.NOT_WORKING_DAY]: 'Not Working',
};

function getDayStatusTextAr(status: DayStatus): string {
  return DAY_STATUS_TEXT_AR[status];
}

function getDayStatusTextEn(status: DayStatus): string {
  return DAY_STATUS_TEXT_EN[status];
}

// ─── Date picker ─────────────────────────────────────────────────────────────

async function sendDatePicker(userId: string, data: BookingData, adapter: BotAdapter) {
  const doc = await prisma.doctor.findUnique({ where: { id: data.doctorId! } });
  if (!doc) return adapter.sendText(userId, MSG.error);

  // Single availability pass — reused for both nearest appointment and list
  const days = await listUpcomingDays(doc, BOOKING_WINDOW_DAYS);
  const visibleDays = days.filter(d => d.status !== DayStatus.NOT_WORKING_DAY);
  if (!visibleDays.length) return adapter.sendText(userId, MSG.noUpcomingAvailability);

  // Show nearest available appointment before the list
  const nearest = findNearestAppointment(visibleDays);
  if (nearest) {
    const nearestDay = visibleDays.find(d => d.date === nearest.date)!;
    await adapter.sendText(userId, bi(
      `✅ *أقرب موعد متاح*\n${getDayLabelAr(nearestDay)}\n${formatTimeForAr(nearest.time)}`,
      `*Next Available Appointment*\n${getDayLabelEn(nearestDay)}\n${formatTimeForEn(nearest.time)}`
    ));
  }

  return adapter.sendList(userId, waHeader(bi('اختر اليوم', 'Choose Day')), MSG.selectDate, waButtonLabel('اختر', 'Choose'), [
    {
      title: waSectionTitle('الأيام', 'Days'),
      rows: visibleDays.map(d => {
        const labelAr = getDayLabelAr(d);
        const labelEn = getDayLabelEn(d);
        let descAr: string;
        let descEn: string;
        if (d.status === DayStatus.AVAILABLE && d.firstSlot) {
          descAr = `${d.availableCount} ${d.availableCount === 1 ? 'موعد' : 'مواعيد'} • أول موعد ${formatTimeForAr(d.firstSlot)}`;
          descEn = `${d.availableCount} ${d.availableCount === 1 ? 'slot' : 'slots'} • First at ${formatTimeForEn(d.firstSlot)}`;
        } else {
          descAr = getDayStatusTextAr(d.status);
          descEn = getDayStatusTextEn(d.status);
        }
        return {
          id: `date_${d.date}`,
          title: `📅 ${labelAr}`,
          description: waRowDescription(descAr, descEn),
        };
      }),
    },
    navigationSection(),
  ]);
}

async function resendStep(userId: string, step: string, data: BookingData, adapter: BotAdapter, cid: string) {
  switch (step) {
    case 'main_menu': return sendMainMenu(userId, adapter);
    case 'select_doctor': return sendDoctorsList(userId, adapter);
    case 'select_service': return sendServicesList(userId, data, adapter);
    case 'select_date': return sendDatePicker(userId, data, adapter);
    case 'select_time': return resendTimePicker(userId, data, adapter, cid);
    case 'ask_name': return sendTextWithNav(userId, MSG.askName, adapter, cid);
    case 'ask_whatsapp': return sendTextWithNav(userId, MSG.askWhatsapp, adapter, cid);
    case 'ask_call_time': return sendCallTimesList(userId, adapter);
    case 'booking_summary': return sendBookingSummaryScreen(userId, data, adapter);
    default: return sendMainMenu(userId, adapter);
  }
}

async function resendTimePicker(userId: string, data: BookingData, adapter: BotAdapter, cid: string) {
  const d = data.date ? new Date(data.date) : new Date();
  const labelAr = d.toLocaleDateString('ar-SA', { weekday: 'long', day: 'numeric', month: 'long' });
  const labelEn = d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' });
  const doc = await prisma.doctor.findUnique({ where: { id: data.doctorId! } }).catch(() => null);
  if (!doc) return adapter.sendText(userId, MSG.error);
  const { available } = await getAvailableSlots(doc, data.date!).catch(() => ({ available: [] as string[] }));
  if (!available.length) return sendDatePicker(userId, data, adapter);
  const nav = navigationSection();
  const maxVisible = 10 - nav.rows.length;
  if (available.length <= maxVisible) {
    return adapter.sendList(userId, waHeader(bi('اختر الوقت', 'Choose Time')), MSG.selectTime(labelAr, labelEn), waButtonLabel('اختر', 'Choose'), [
      { title: waSectionTitle(labelAr, labelEn), rows: available.map(t => ({ id: `time_${t}`, title: t })) },
      nav,
    ]);
  }
  const showCount = maxVisible - 1;
  const slots: { id: string; title: string; description?: string }[] = available.slice(0, showCount).map(t => ({ id: `time_${t}`, title: t }));
  slots.push({ id: 'time_more', title: '🕐 المزيد من المواعيد', description: 'More Times' });
  return adapter.sendList(userId, waHeader(bi('اختر الوقت', 'Choose Time')), MSG.selectTime(labelAr, labelEn), waButtonLabel('اختر', 'Choose'), [
    { title: waSectionTitle(labelAr, labelEn), rows: slots },
    nav,
  ]);
}

async function sendCallTimesList(userId: string, adapter: BotAdapter) {
  return adapter.sendList(userId, waHeader(bi('أفضل وقت للتواصل', 'Best Time to Call')), MSG.askCallTime, waButtonLabel('اختر', 'Choose'), [
    { title: waSectionTitle('أفضل وقت', 'Best Time'), rows: CALL_TIMES.map(c => ({
      id: c.id,
      title: waRowTitle(c.titleAr, c.titleEn),
      description: waRowDescription(c.descAr, c.descEn),
    })) },
    navigationSection(),
  ]);
}

async function sendBookingSummaryScreen(userId: string, data: BookingData, adapter: BotAdapter) {
  const d = data.date ? new Date(data.date) : new Date();
  const labelAr = d.toLocaleDateString('ar-SA', { weekday: 'long', day: 'numeric', month: 'long' });
  const labelEn = d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' });
  const summary = MSG.bookingSummary(
    data.name!, data.doctorNameAr!, data.doctorNameEn!,
    data.serviceAr!, data.serviceEn!,
    labelAr, labelEn, data.time!,
    data.callTimeAr!, data.callTimeEn!
  );
  return adapter.sendList(userId, waHeader(bi('ملخص الحجز', 'Booking Summary')), summary, waButtonLabel('اختر', 'Choose'), [{
    title: waSectionTitle('تأكيد الحجز', 'Confirm Booking'),
    rows: [
      rowAr('confirm_booking', '✅ تأكيد الحجز', 'Confirm'),
      rowAr('edit_booking', '✏️ تعديل الحجز', 'Edit'),
      rowAr('cancel_booking', '❌ إلغاء', 'Cancel'),
    ],
  }]);
}

async function sendOffersScreen(userId: string, adapter: BotAdapter): Promise<string> {
  const offers = await prisma.offer.findMany({ where: { isActive: true }, orderBy: { createdAt: 'desc' }, take: 10 });
  if (!offers.length) {
    await adapter.sendText(userId, MSG.noOffers);
    return 'offers';
  }
  let text = MSG.offersHeaderAr;
  offers.forEach((o, i) => {
    text += `${i + 1}. *${o.titleAr}*\n   ${o.descriptionAr || ''}\n`;
    if (o.code) text += `   كود الخصم: \`${o.code}\`\n`;
    text += '\n';
  });
  text += '\n— — —\n\n' + MSG.offersHeaderEn;
  offers.forEach((o, i) => {
    text += `${i + 1}. *${o.titleEn}*\n   ${o.descriptionEn || ''}\n`;
    if (o.code) text += `   Code: \`${o.code}\`\n`;
    text += '\n';
  });
  text += MSG.offersFooter;
  await adapter.sendList(userId, waHeader(bi('العروض', 'Offers')), text, waButtonLabel('اختر', 'Choose'), [
    { title: waSectionTitle('الإجراءات', 'Actions'), rows: [rowAr('menu_book', '📅 احجز الآن', 'Book Now')] },
    navigationSection(),
  ]);
  return 'offers';
}

// ─── Phase 4: Command Handler Classes ─────────────────────────────────────────

async function lookupExistingBooking(userId: string): Promise<{ id: string; date: string; time: string; doctor: { nameAr: string; nameEn: string } } | null> {
  const today = new Date().toISOString().split('T')[0];
  const phone = userId.replace(/^ig_/, '');
  const isInstagram = userId.startsWith('ig_');
  const booking = await prisma.booking.findFirst({
    where: {
      date: { gte: today },
      status: { notIn: ['cancelled', 'completed'] },
      ...(isInstagram ? { instagramPsid: phone } : { phone }),
    },
    orderBy: { date: 'asc' },
    include: { doctor: { select: { nameAr: true, nameEn: true } } },
  });
  if (!booking || !booking.doctor) return null;
  return { id: booking.id, date: booking.date, time: booking.time, doctor: booking.doctor };
}

class MainMenuHandler implements MessageHandler {
  async handle(userId: string, input: string, _data: BookingData, adapter: BotAdapter, _source: BookingSource, _cid: string): Promise<string | undefined> {
    switch (input) {
      case 'menu_book': await sendDoctorsList(userId, adapter); return 'select_doctor';
      case 'menu_offers': return sendOffersScreen(userId, adapter);
      case 'menu_contact': await adapter.sendText(userId, MSG.contactInfo); return;
      case 'menu_location': await adapter.sendText(userId, MSG.locationInfo); return;
      case 'menu_my_booking': {
        const existing = await lookupExistingBooking(userId);
        if (!existing) { await adapter.sendText(userId, MSG.noFutureBooking); return; }
        const docName = `${existing.doctor.nameAr} / ${existing.doctor.nameEn}`;
        await adapter.sendList(userId, waHeader(bi('موعدي', 'My Booking')), MSG.existingBookingFound(existing.date, existing.time, docName), waButtonLabel('اختر', 'Choose'), [
          {
            title: waSectionTitle('الموعد', 'Appointment'),
            rows: [
              rowAr(`cancel_${existing.id}`, '❌ إلغاء الموعد', 'Cancel'),
              rowAr(`reschedule_${existing.id}`, '🔄 تغيير الموعد', 'Reschedule'),
              rowAr('new_booking', '📅 حجز جديد', 'New Booking'),
            ],
          },
          navigationSection(),
        ]);
        return;
      }
      case 'new_booking': await sendDoctorsList(userId, adapter); return 'select_doctor';
      default: {
        if (input.startsWith('cancel_')) {
          const bookingId = input.slice(7);
          try {
            await prisma.booking.update({
              where: { id: bookingId },
              data: { status: 'cancelled', notes: 'Cancelled by patient' },
            });
            await adapter.sendText(userId, MSG.cancelledSuccess);
            await logAudit(AuditAction.BOOKING_CANCELLED, 'Booking', bookingId,
              { reason: 'cancelled_by_patient' }, { userId, correlationId: _cid }
            );
          } catch { await adapter.sendText(userId, MSG.error); }
          return;
        }
        if (input.startsWith('reschedule_')) {
          const bookingId = input.slice(11);
          const booking = await prisma.booking.findUnique({ where: { id: bookingId }, include: { doctor: true } });
          if (!booking || !booking.doctor) { await adapter.sendText(userId, MSG.error); return; }
          _data.existingBookingId = bookingId;
          _data.doctorId = booking.doctorId;
          _data.doctorNameAr = booking.doctor.nameAr || booking.doctor.nameEn;
          _data.doctorNameEn = booking.doctor.nameEn || booking.doctor.nameAr;
          _data.serviceAr = booking.service;
          _data.serviceEn = booking.service;
          _data.name = booking.name;
          _data.callTimeAr = '';
          _data.callTimeEn = '';
          await sendDatePicker(userId, _data, adapter);
          return 'select_date';
        }
        await adapter.sendText(userId, MSG.pleaseUseButtons); return;
      }
    }
  }
}

class DoctorHandler implements MessageHandler {
  async handle(userId: string, input: string, data: BookingData, adapter: BotAdapter, _source: BookingSource, _cid: string): Promise<string | undefined> {
    const doc = await prisma.doctor.findUnique({ where: { id: input } }).catch(() => null);
    if (!doc) { await adapter.sendText(userId, MSG.error); return; }
    data.doctorId = doc.id;
    data.doctorNameAr = doc.nameAr || doc.nameEn;
    data.doctorNameEn = doc.nameEn || doc.nameAr;
    if (data.editReturn) {
      const ret = data.editReturn; data.editField = undefined; data.editReturn = undefined;
      await sendBookingSummaryScreen(userId, data, adapter); return ret;
    }
    await sendServicesList(userId, data, adapter); return 'select_service';
  }
}

class ServiceHandler implements MessageHandler {
  async handle(userId: string, input: string, data: BookingData, adapter: BotAdapter, _source: BookingSource, _cid: string): Promise<string | undefined> {
    const svc = SERVICES_BILINGUAL.find(s => s.id === input);
    if (!svc) { await adapter.sendText(userId, MSG.error); return; }
    data.serviceAr = svc.ar; data.serviceEn = svc.en;
    if (data.editReturn) {
      const ret = data.editReturn; data.editField = undefined; data.editReturn = undefined;
      await sendBookingSummaryScreen(userId, data, adapter); return ret;
    }
    await sendDatePicker(userId, data, adapter); return 'select_date';
  }
}

class DateHandler implements MessageHandler {
  async handle(userId: string, input: string, data: BookingData, adapter: BotAdapter, _source: BookingSource, _cid: string): Promise<string | undefined> {
    if (!input.startsWith('date_')) { await adapter.sendText(userId, MSG.error); return; }
    const date = input.replace('date_', '');
    const doc = await prisma.doctor.findUnique({ where: { id: data.doctorId! } });
    if (!doc) return;
    const { available } = await getAvailableSlots(doc, date);
    if (!available.length) { await adapter.sendText(userId, MSG.noSlotsForDay); return; }
    data.date = date;
    const d = new Date(date);
    const labelAr = d.toLocaleDateString('ar-SA', { weekday: 'long', day: 'numeric', month: 'long' });
    const labelEn = d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' });
    const nav = navigationSection();
    const maxVisible = 10 - nav.rows.length;
    if (available.length <= maxVisible) {
      await adapter.sendList(userId, waHeader(bi('اختر الوقت', 'Choose Time')), MSG.selectTime(labelAr, labelEn), waButtonLabel('اختر', 'Choose'), [
        { title: waSectionTitle(labelAr, labelEn), rows: available.map(t => ({ id: `time_${t}`, title: t })) },
        nav,
      ]);
    } else {
      const showCount = maxVisible - 1;
      const slots: { id: string; title: string; description?: string }[] = available.slice(0, showCount).map(t => ({ id: `time_${t}`, title: t }));
      slots.push({ id: 'time_more', title: '🕐 المزيد من المواعيد', description: 'More Times' });
      await adapter.sendList(userId, waHeader(bi('اختر الوقت', 'Choose Time')), MSG.selectTime(labelAr, labelEn), waButtonLabel('اختر', 'Choose'), [
        { title: waSectionTitle(labelAr, labelEn), rows: slots },
        nav,
      ]);
    }
    return 'select_time';
  }
}

class TimeHandler implements MessageHandler {
  async handle(userId: string, input: string, data: BookingData, adapter: BotAdapter, _source: BookingSource, cid: string): Promise<string | undefined> {
    if (input === 'time_more') {
      const doc = await prisma.doctor.findUnique({ where: { id: data.doctorId! } });
      if (!doc) return;
      const { available } = await getAvailableSlots(doc, data.date!).catch(() => ({ available: [] as string[] }));
      const remaining = available.slice(6);
      if (!remaining.length) { await adapter.sendText(userId, MSG.error); return; }
      const d = data.date ? new Date(data.date) : new Date();
      const labelAr = d.toLocaleDateString('ar-SA', { weekday: 'long', day: 'numeric', month: 'long' });
      const labelEn = d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' });
      const displaySlots = remaining.slice(0, 7).map(t => ({ id: `time_${t}`, title: t }));
      await adapter.sendList(userId, waHeader(bi('المزيد من المواعيد', 'More Times')), MSG.selectTime(labelAr, labelEn), waButtonLabel('اختر', 'Choose'), [
        { title: waSectionTitle(labelAr, labelEn), rows: displaySlots },
      ]);
      return;
    }
    if (!input.startsWith('time_')) { await adapter.sendText(userId, MSG.error); return; }
    const t = input.replace('time_', '');
    if (!/^\d{2}:\d{2}$/.test(t)) { await adapter.sendText(userId, MSG.error); return; }
    data.time = t;
    if (data.editReturn) {
      const ret = data.editReturn; data.editField = undefined; data.editReturn = undefined;
      await sendBookingSummaryScreen(userId, data, adapter); return ret;
    }
    await sendTextWithNav(userId, MSG.askName, adapter, cid); return 'ask_name';
  }
}

class NameHandler implements MessageHandler {
  async handle(userId: string, input: string, data: BookingData, adapter: BotAdapter, source: BookingSource, cid: string): Promise<string | undefined> {
    const trimmed = input.trim();
    if (!isValidPatientName(trimmed)) {
      if (!/^[A-Za-z '\-]+$/.test(trimmed)) { await adapter.sendText(userId, MSG.nameInvalidNotEnglish); }
      else { await adapter.sendText(userId, MSG.nameTooShort); }
      return;
    }
    data.name = trimmed;
    if (data.editReturn) {
      const ret = data.editReturn; data.editField = undefined; data.editReturn = undefined;
      await sendBookingSummaryScreen(userId, data, adapter); return ret;
    }
    const next = source === BookingSource.instagram ? 'ask_whatsapp' : 'ask_call_time';
    if (next === 'ask_whatsapp') { await sendTextWithNav(userId, MSG.askWhatsapp, adapter, cid); }
    else { await sendCallTimesList(userId, adapter); }
    return next;
  }
}

class WhatsAppHandler implements MessageHandler {
  async handle(userId: string, input: string, data: BookingData, adapter: BotAdapter, _source: BookingSource, _cid: string): Promise<string | undefined> {
    const cleaned = input.replace(/\D/g, '');
    if (cleaned.length < 9 || cleaned.length > 15) { await adapter.sendText(userId, MSG.invalidWhatsapp); return; }
    data.whatsappNumber = cleaned.startsWith('966') ? cleaned : cleaned.startsWith('0') ? `966${cleaned.slice(1)}` : `966${cleaned}`;
    await sendCallTimesList(userId, adapter); return 'ask_call_time';
  }
}

class CallTimeHandler implements MessageHandler {
  async handle(userId: string, input: string, data: BookingData, adapter: BotAdapter, _source: BookingSource, _cid: string): Promise<string | undefined> {
    const ct = CALL_TIMES.find(c => c.id === input);
    if (!ct) { await adapter.sendText(userId, MSG.error); return; }
    data.callTimeAr = ct.titleAr; data.callTimeEn = ct.titleEn;
    await sendBookingSummaryScreen(userId, data, adapter); return 'booking_summary';
  }
}

class OffersHandler implements MessageHandler {
  async handle(userId: string, input: string, _data: BookingData, adapter: BotAdapter, _source: BookingSource, _cid: string): Promise<string | undefined> {
    if (input === 'menu_book') { await sendDoctorsList(userId, adapter); return 'select_doctor'; }
    return;
  }
}

class SummaryHandler implements MessageHandler {
  async handle(userId: string, input: string, data: BookingData, adapter: BotAdapter, _source: BookingSource, cid: string): Promise<string | undefined> {
    switch (input) {
      case 'confirm_booking':
        return 'confirm';
      case 'cancel_booking':
        await clearSession(userId);
        await adapter.sendText(userId, MSG.cancelled);
        return 'cancelled';
      case 'edit_booking': {
        await adapter.sendList(userId, waHeader(bi('تعديل الحجز', 'Edit Booking')), MSG.bookingEditOptions, waButtonLabel('اختر', 'Choose'), [
          { title: waSectionTitle('اختر للتعديل', 'Choose to Edit'), rows: [
            rowAr('edit_doctor', '👨‍⚕️ الطبيب', 'Doctor'),
            rowAr('edit_service', '💊 الخدمة', 'Service'),
            rowAr('edit_datetime', '📅 التاريخ والوقت', 'Date & Time'),
            rowAr('edit_name', '👤 الاسم', 'Name'),
            rowAr('edit_calltime', '📞 وقت الاتصال', 'Call Time'),
          ]},
          navigationSection(),
        ]);
        return;
      }
      default:
        if (input.startsWith('edit_')) {
          const targetStep = EDIT_FIELD_MAP[input];
          if (targetStep) {
            data.editReturn = 'booking_summary';
            data.editField = input;
            if (FF_EDIT_FLOW_FIX) {
              await resendStep(userId, targetStep, data, adapter, cid);
              return targetStep;
            } else {
              await setSession(userId, targetStep, data);
              await resendStep(userId, targetStep, data, adapter, cid);
              return '__handled__';
            }
          }
        }
        await sendBookingSummaryScreen(userId, data, adapter);
        return;
    }
  }
}

const HANDLERS: Record<string, MessageHandler> = {
  main_menu: new MainMenuHandler(),
  select_doctor: new DoctorHandler(),
  select_service: new ServiceHandler(),
  select_date: new DateHandler(),
  select_time: new TimeHandler(),
  ask_name: new NameHandler(),
  ask_whatsapp: new WhatsAppHandler(),
  ask_call_time: new CallTimeHandler(),
  offers: new OffersHandler(),
  booking_summary: new SummaryHandler(),
};

// ─── Navigation Handler ──────────────────────────────────────────────────────

async function handleNavigation(
  userId: string, input: string, currentStep: string,
  data: BookingData, adapter: BotAdapter, cid: string
): Promise<boolean> {
  switch (input) {
    case 'cancel':
      await clearSession(userId);
      await adapter.sendText(userId, MSG.cancelled);
      return true;
    case 'main_menu': {
      data.editReturn = undefined; data.editField = undefined;
      await setSession(userId, 'main_menu', data);
      await sendMainMenu(userId, adapter);
      return true;
    }
    case 'back': {
      const prev = data.previousStep || STEP_ORDER[currentStep] || undefined;
      if (prev && prev !== currentStep) {
        data.editReturn = undefined; data.editField = undefined;
        await setSession(userId, prev, data);
        await resendStep(userId, prev, data, adapter, cid);
      } else {
        await setSession(userId, 'main_menu', data);
        await sendMainMenu(userId, adapter);
      }
      return true;
    }
    default:
      return false;
  }
}

async function sendReminderMessage(phone: string, bookingId: string, adapter: BotAdapter): Promise<void> {
  try {
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: { doctor: { select: { nameAr: true, nameEn: true } } },
    });
    if (!booking || !booking.doctor) return;
    const text = MSG.reminder(
      booking.name, booking.doctor.nameAr, booking.doctor.nameEn,
      booking.service, booking.service, booking.date, booking.time
    );
    const welcomeText = MSG.preVisitInstructions;
    await adapter.sendText(phone, text);
    await adapter.sendText(phone, welcomeText);
    await prisma.booking.update({ where: { id: bookingId }, data: { reminderSent: true, reminderSentAt: new Date() } });
  } catch { /* non-fatal */ }
}

// ─── Booking Confirmation ────────────────────────────────────────────────────

async function executeBooking(
  userId: string, data: BookingData, adapter: BotAdapter,
  source: BookingSource, correlationId: string
): Promise<{ bookingId: string; created: boolean } | null> {
  try {
    // If rescheduling existing booking, update instead of create
    if (data.existingBookingId) {
      const updated = await prisma.booking.update({
        where: { id: data.existingBookingId },
        data: { date: data.date!, time: data.time! },
      });
      await clearSession(userId);
      const d = new Date(data.date!);
      const labelAr = d.toLocaleDateString('ar-SA', { weekday: 'long', day: 'numeric', month: 'long' });
      const labelEn = d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' });
      await adapter.sendText(userId, MSG.confirmationSummary(
        data.name!, data.doctorNameAr!, data.doctorNameEn!,
        data.serviceAr!, data.serviceEn!,
        labelAr, labelEn, data.time!,
        data.callTimeAr!, data.callTimeEn!
      ));
      try {
        const { updateCalendarEvent } = await import('./googleCalendar');
        const doc = await prisma.doctor.findUnique({ where: { id: data.doctorId! } });
        if (doc) await updateCalendarEvent(updated, doc);
      } catch { /* non-fatal */ }
      return { bookingId: data.existingBookingId, created: false };
    }

    const result = await createBookingIdempotent(userId, data, source, correlationId);

    try {
      const doc = await prisma.doctor.findUnique({ where: { id: data.doctorId! } });
      if (doc && result) {
        const fullBooking = await prisma.booking.findUnique({ where: { id: result.id } });
        if (fullBooking) {
          const { createCalendarEvent } = await import('./googleCalendar');
          const cal = await createCalendarEvent(fullBooking, doc);
          if (cal) await prisma.booking.update({ where: { id: fullBooking.id }, data: { ...cal, calendarSynced: true } });
        }
      }
    } catch { /* non-fatal */ }

    // Auto-send reminder for same-day or next-day bookings
    if (data.date) {
      const bookingDate = new Date(data.date);
      const now = new Date();
      const diffDays = Math.floor((bookingDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays <= 1 && result?.id) {
        sendReminderMessage(userId, result.id, adapter).catch(() => {});
      }
    }

    await clearSession(userId);

    const d = new Date(data.date!);
    const labelAr = d.toLocaleDateString('ar-SA', { weekday: 'long', day: 'numeric', month: 'long' });
    const labelEn = d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' });

    // Send confirmation with pre-visit instructions
    await adapter.sendText(userId, MSG.confirmationSummary(
      data.name!, data.doctorNameAr!, data.doctorNameEn!,
      data.serviceAr!, data.serviceEn!,
      labelAr, labelEn, data.time!,
      data.callTimeAr!, data.callTimeEn!
    ));
    await adapter.sendText(userId, MSG.preVisitInstructions);

    return result ? { bookingId: result.id, created: result.created } : null;
  } catch (err: unknown) {
    const e = err as { code?: string; message?: string };
    if (e.message?.includes('already in progress')) {
      logger.warn('[Booking] Confirmation already in progress', { userId, correlationId });
      await adapter.sendText(userId, MSG.slotTaken);
      return null;
    }
    logger.error('[Booking] Confirmation failed', { error: String(err), userId, correlationId });
    await adapter.sendText(userId, MSG.error);
    return null;
  }
}

// ─── Main Entry Point ────────────────────────────────────────────────────────

export async function processMessage(
  userId: string,
  input: string,
  adapter: BotAdapter,
  source: BookingSource = BookingSource.whatsapp,
  isText = true,
  correlationId?: string,
  messageId?: string,
  webhookId?: string,
) {
  const startTime = Date.now();
  const cid = correlationId || 'no-cid';
  let normInput = input.trim();
  const eventType = determineEventType(normInput, isText);
  const conversationId = `conv_${userId}`;

  logger.info('[Engine] processMessage', {
    userId, input: normInput, isText, eventType: EventType[eventType],
    source, correlationId: cid, messageId, webhookId,
  });

  // Track event
  const track = (overrides: Partial<Omit<Parameters<typeof trackEvent>[0], 'success'>> & { success: boolean }) => {
    trackEvent({
      conversationId,
      userId,
      platform: source,
      eventType: EventType[eventType],
      payloadId: normInput,
      isText,
      correlationId: cid,
      messageId,
      webhookId,
      ...overrides,
    }).catch(() => {});
  };

  try {
    // Retry loop for concurrency conflicts (Phase 3)
    let lastError: Error | null = null;
    let session: SessionResult | null = null;

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        session = await getSession(userId);
        break;
      } catch (err) {
        lastError = err as Error;
        logger.warn('[Engine] Session read error, retrying', {
          error: String(err), attempt, correlationId: cid,
        });
        await new Promise(r => setTimeout(r, 100 * Math.pow(2, attempt)));
      }
    }
    if (!session && lastError) {
      throw lastError;
    }

    // ── No session ──
    if (!session) {
      const isGreeting = isText && TRIGGERS.some(t => normInput.toLowerCase() === t.toLowerCase());
      if (isGreeting || eventType === EventType.NAVIGATION_SYSTEM) {
        await setSession(userId, 'main_menu', {});
        await sendMainMenu(userId, adapter);
        metrics.conversationsStarted.inc();
        track({ currentState: 'main_menu', success: true, executionTimeMs: Date.now() - startTime });
        logger.info('[Engine] new session', { userId, duration: Date.now() - startTime, correlationId: cid });
        return;
      }
      await adapter.sendText(userId, MSG.notFound);
      track({ success: true, executionTimeMs: Date.now() - startTime });
      logger.info('[Engine] no session', { userId, duration: Date.now() - startTime, correlationId: cid });
      return;
    }

    const step = session.step as string;
    const data: BookingData = session.data || {};

    // ── Fallback numbered-list mapping ──
    if (/^\d+$/.test(normInput)) {
      const mappedId = await resolveFallbackInput(userId, normInput);
      if (mappedId) {
        logger.info('[Engine] fallback mapping', { userId, from: normInput, to: mappedId, correlationId: cid });
        normInput = mappedId;
      }
    }

    logger.debug('[Engine] routing', { userId, step, input: normInput, sessionVersion: session.sessionVersion, correlationId: cid });

    // ── Navigation ──
    if (eventType === EventType.NAVIGATION_SYSTEM) {
      const handled = await handleNavigation(userId, normInput, step, data, adapter, cid);
      if (handled) {
        track({
          currentState: step, previousState: step, eventType: 'NAVIGATION',
          success: true, executionTimeMs: Date.now() - startTime,
        });
        logger.info('[Engine] navigation', { userId, input: normInput, step, duration: Date.now() - startTime, correlationId: cid });
        return;
      }
    }

    // ── Summary handler (booking_summary is special) ──
    if (step === 'booking_summary') {
      const handler = new SummaryHandler();
      const result = await handler.handle(userId, normInput, data, adapter, source, cid);

      if (result === 'confirm') {
        const bookingResult = await executeBooking(userId, data, adapter, source, cid);
        if (bookingResult?.created) {
          metrics.bookingsCreated.inc();
          metrics.conversationsCompleted.inc();
        } else if (!bookingResult) {
          metrics.bookingsFailed.inc();
        }
        track({
          currentState: 'booking_summary', previousState: step, success: bookingResult !== null,
          bookingCreated: bookingResult?.created ?? false,
          bookingId: bookingResult?.bookingId,
          executionTimeMs: Date.now() - startTime,
        });
        logger.info('[Engine] booking confirmed', { userId, bookingResult, duration: Date.now() - startTime, correlationId: cid });
        return;
      }
      if (result === 'cancelled') {
        track({
          currentState: 'cancelled', previousState: step, bookingCancelled: true,
          success: true, executionTimeMs: Date.now() - startTime,
        });
        return;
      }
      if (result === '__handled__') {
        track({
          currentState: step, previousState: step, success: true,
          executionTimeMs: Date.now() - startTime,
        });
        return;
      }
      track({
        currentState: 'booking_summary', previousState: step, success: true,
        executionTimeMs: Date.now() - startTime,
      });
      return;
    }

    // ── TEXT in non-text step ──
    if (eventType === EventType.TEXT && !['ask_name', 'ask_whatsapp'].includes(step)) {
      const isGreeting = TRIGGERS.some(t => normInput.toLowerCase() === t.toLowerCase());
      if (isGreeting) {
        await setSession(userId, 'main_menu', {});
        await sendMainMenu(userId, adapter);
        track({ currentState: 'main_menu', previousState: step, success: true, executionTimeMs: Date.now() - startTime });
        logger.info('[Engine] greeting, restarted', { userId, duration: Date.now() - startTime, correlationId: cid });
        return;
      }
      await adapter.sendText(userId, MSG.pleaseUseButtons);
      track({ currentState: step, previousState: step, success: true, executionTimeMs: Date.now() - startTime });
      return;
    }

    // ── Route to handler ──
    const handler = HANDLERS[step];
    if (!handler) {
      logger.warn('[Engine] unknown step', { userId, step, correlationId: cid });
      await clearSession(userId);
      await adapter.sendText(userId, MSG.error);
      track({ currentState: step, success: false, errorMessage: `Unknown step: ${step}`, executionTimeMs: Date.now() - startTime });
      return;
    }

    let nextStep: string | undefined;
    try {
      nextStep = await handler.handle(userId, normInput, data, adapter, source, cid);
    } catch (err) {
      logger.error('[Engine] handler error', { error: String(err), step, userId, correlationId: cid });
      await adapter.sendText(userId, MSG.error);
      track({ currentState: step, success: false, errorMessage: String(err), executionTimeMs: Date.now() - startTime });
      return;
    }

    // ── Update session with optimistic locking ──
    try {
      if (nextStep && nextStep !== '__handled__') {
        data.previousStep = step;
        await setSession(userId, nextStep, data, session.sessionVersion);
        logger.info('[Engine] transition', {
          userId, from: step, to: nextStep, version: session.sessionVersion,
          duration: Date.now() - startTime, correlationId: cid,
        });
      } else {
        await setSession(userId, step, data, session.sessionVersion);
        logger.info('[Engine] stay', {
          userId, step, version: session.sessionVersion,
          duration: Date.now() - startTime, correlationId: cid,
        });
      }
      track({
        currentState: nextStep || step, previousState: step,
        success: true, executionTimeMs: Date.now() - startTime,
      });
    } catch (err) {
      if (err instanceof ConcurrencyError) {
        logger.warn('[Engine] session version conflict', {
          userId, step, expected: err.expectedVersion, actual: err.actualVersion,
          correlationId: cid,
        });
        // Re-read session and re-process (recursive guard: only 1 retry)
        logger.info('[Engine] retrying with fresh session', { userId, correlationId: cid });
        const freshSession = await getSession(userId);
        if (freshSession) {
          const freshData = freshSession.data as BookingData;
          Object.assign(data, freshData);
          await setSession(userId, nextStep || step, data, freshSession.sessionVersion);
          logger.info('[Engine] resolved conflict', { userId, step, newVersion: freshSession.sessionVersion + 1, correlationId: cid });
        }
        track({
          currentState: nextStep || step, previousState: step,
          success: true, executionTimeMs: Date.now() - startTime,
        });
      } else {
        logger.error('[Engine] session write error', {
          error: String(err), userId, step, correlationId: cid,
        });
        track({
          currentState: step, success: false,
          errorMessage: String(err), executionTimeMs: Date.now() - startTime,
        });
      }
    }
  } catch (err) {
    logger.error('[Engine] fatal error', {
      error: String(err), userId, correlationId: cid,
    });
    track({ success: false, errorMessage: String(err), executionTimeMs: Date.now() - startTime });
    try {
      await adapter.sendText(userId, MSG.error);
    } catch { /* last resort */ }
  }
}
