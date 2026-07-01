import { prisma } from './prisma';
import { getAvailableSlots, listUpcomingDays } from './availability';
import { MSG, CALL_TIMES, SERVICES_BILINGUAL, TRIGGERS, BookingData } from './botMessages';
import { BookingSource } from '@prisma/client';

// ─── Adapter interface (implemented separately for WA and IG) ────────────────
export interface BotAdapter {
  sendText(to: string, text: string): Promise<void>;
  sendList(to: string, header: string, body: string, button: string, sections: ListSection[]): Promise<void>;
}

export interface ListSection {
  title: string;
  rows: { id: string; title: string; description?: string }[];
}

// ─── Session helpers using Prisma WhatsAppSession ────────────────────────────
async function getSession(phone: string) {
  return prisma.whatsAppSession.findUnique({ where: { phone } });
}

async function setSession(phone: string, step: string, data: BookingData) {
  return prisma.whatsAppSession.upsert({
    where: { phone },
    create: {
      phone,
      step: step as never,
      data: data as never,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    },
    update: {
      step: step as never,
      data: data as never,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    },
  });
}

async function clearSession(phone: string) {
  await prisma.whatsAppSession.deleteMany({ where: { phone } });
}

// ─── English-only name validator ─────────────────────────────────────────────
// Per product requirement: the patient must type their name in English
// letters only (spaces, hyphens, and apostrophes allowed for names like
// "Al-Otaibi" or "O'Brien"). No digits, no Arabic script, no other symbols.
const ENGLISH_NAME_RE = /^[A-Za-z]+(?:[ '\-][A-Za-z]+)*$/;

function isValidEnglishName(input: string): boolean {
  return ENGLISH_NAME_RE.test(input.trim()) && input.trim().split(/\s+/).length >= 2;
}

// ─── Main entry point ────────────────────────────────────────────────────────
export async function processMessage(
  userId: string,
  input: string,
  adapter: BotAdapter,
  source: BookingSource = BookingSource.whatsapp
) {
  const norm  = (input || '').trim();
  const lower = norm.toLowerCase();
  const session = await getSession(userId);
  const isGreeting = TRIGGERS.some(w => lower.includes(w));
  const isExpired = session && session.expiresAt < new Date();

  if (!session || isGreeting || isExpired) {
    await clearSession(userId);
    await setSession(userId, 'main_menu', {});
    return sendMainMenu(userId, adapter);
  }

  const data = session.data as BookingData;

  switch (session.step) {
    case 'main_menu':      return handleMainMenu(userId, data, norm, adapter);
    case 'select_doctor':  return handleDoctor(userId, data, norm, adapter);
    case 'select_service': return handleService(userId, data, norm, adapter);
    case 'select_date':    return handleDateChoice(userId, data, norm, adapter);
    case 'select_time':    return handleTime(userId, data, norm, adapter);
    case 'ask_name':       return handleName(userId, data, norm, adapter);
    case 'ask_whatsapp':   return handleWhatsapp(userId, data, norm, adapter, source); // Instagram only
    case 'ask_call_time':  return handleCallTime(userId, data, norm, adapter, source);
    case 'offers':         return handleOfferAction(userId, data, norm, adapter);
    default:               return adapter.sendText(userId, MSG.notFound);
  }
}

// ─── Menu ─────────────────────────────────────────────────────────────────────
async function sendMainMenu(userId: string, adapter: BotAdapter) {
  const sections: ListSection[] = [{ title: 'القائمة / Menu', rows: [
    { id: 'menu_book',    title: `${MSG.menuOptions.bookAr} / ${MSG.menuOptions.bookEn}` },
    { id: 'menu_offers',  title: `${MSG.menuOptions.offersAr} / ${MSG.menuOptions.offersEn}` },
    { id: 'menu_contact', title: `${MSG.menuOptions.contactAr} / ${MSG.menuOptions.contactEn}` },
  ]}];
  return adapter.sendList(userId, '🏥 SmartClinic', MSG.welcome(), 'اختر / Choose', sections);
}

async function handleMainMenu(userId: string, data: BookingData, input: string, adapter: BotAdapter) {
  if (input === 'menu_book') {
    await setSession(userId, 'select_doctor', data);
    return sendDoctors(userId, adapter);
  }
  if (input === 'menu_offers') {
    await setSession(userId, 'offers', data);
    return sendOffers(userId, adapter);
  }
  if (input === 'menu_contact') {
    return adapter.sendText(userId, MSG.contactInfo);
  }
  return sendMainMenu(userId, adapter);
}

// ─── Offers ───────────────────────────────────────────────────────────────────
async function sendOffers(userId: string, adapter: BotAdapter) {
  const offers = await prisma.offer.findMany({
    where: { isActive: true },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });
  if (!offers.length) return adapter.sendText(userId, MSG.noOffers);

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

  const sections: ListSection[] = [{ title: 'الإجراءات / Actions', rows: [
    { id: 'menu_book', title: '📅 احجز الآن / Book Now' },
  ]}];
  return adapter.sendList(userId, '🎁 العروض / Offers', text, 'احجز / Book', sections);
}

async function handleOfferAction(userId: string, data: BookingData, _input: string, adapter: BotAdapter) {
  await setSession(userId, 'select_doctor', data);
  return sendDoctors(userId, adapter);
}

// ─── Doctors ──────────────────────────────────────────────────────────────────
async function sendDoctors(userId: string, adapter: BotAdapter) {
  const doctors = await prisma.doctor.findMany({ where: { isActive: true } });
  if (!doctors.length) return adapter.sendText(userId, MSG.noDoctors);

  const sections: ListSection[] = [{ title: 'الأطباء / Doctors', rows: doctors.map(d => ({
    id: d.id,
    title: `د. ${d.nameAr || d.nameEn} / Dr. ${d.nameEn || d.nameAr}`,
    description: `${d.specialtyAr || ''}${d.specialtyAr && d.specialtyEn ? ' / ' : ''}${d.specialtyEn || ''}`,
  }))}];
  return adapter.sendList(userId, '👨‍⚕️ اختر الطبيب / Choose Doctor', MSG.selectDoctor, 'اختر / Choose', sections);
}

async function handleDoctor(userId: string, data: BookingData, input: string, adapter: BotAdapter) {
  const doc = await prisma.doctor.findUnique({ where: { id: input } }).catch(() => null);
  if (!doc) return adapter.sendText(userId, MSG.error);
  data.doctorId     = doc.id;
  data.doctorNameAr = doc.nameAr || doc.nameEn;
  data.doctorNameEn = doc.nameEn || doc.nameAr;
  await setSession(userId, 'select_service', data);

  const sections: ListSection[] = [{ title: 'الخدمات / Services', rows: SERVICES_BILINGUAL.map(s => ({
    id: s.id,
    title: `${s.ar} / ${s.en}`,
  }))}];
  return adapter.sendList(
    userId,
    `د. ${data.doctorNameAr} / Dr. ${data.doctorNameEn}`,
    MSG.selectService(data.doctorNameAr!, data.doctorNameEn!),
    'اختر / Choose',
    sections
  );
}

// ─── Service ──────────────────────────────────────────────────────────────────
async function handleService(userId: string, data: BookingData, input: string, adapter: BotAdapter) {
  const svc = SERVICES_BILINGUAL.find(s => s.id === input);
  if (!svc) return adapter.sendText(userId, MSG.error);
  data.serviceAr = svc.ar;
  data.serviceEn = svc.en;
  await setSession(userId, 'select_date', data);
  return sendDatePicker(userId, data, adapter);
}

// ─── Date (click-based — replaces free-text date entry) ──────────────────────
async function sendDatePicker(userId: string, data: BookingData, adapter: BotAdapter) {
  const doc = await prisma.doctor.findUnique({ where: { id: data.doctorId! } });
  if (!doc) return adapter.sendText(userId, MSG.error);

  const days = await listUpcomingDays(doc, 7);
  const openDays = days.filter(d => d.availableCount > 0);

  if (!openDays.length) return adapter.sendText(userId, MSG.noUpcomingAvailability);

  const sections: ListSection[] = [{ title: 'الأيام المتاحة / Available Days', rows: openDays.map(d => ({
    id: `date_${d.date}`,
    title: `${d.labelAr} / ${d.labelEn}`,
    description: `${d.availableCount} ${d.availableCount === 1 ? 'موعد متاح / slot' : 'مواعيد متاحة / slots'}`,
  }))}];
  return adapter.sendList(userId, '📅 اختر اليوم / Choose Day', MSG.selectDate, 'اختر / Choose', sections);
}

async function handleDateChoice(userId: string, data: BookingData, input: string, adapter: BotAdapter) {
  if (!input.startsWith('date_')) return adapter.sendText(userId, MSG.error);
  const date = input.replace('date_', '');

  const doc = await prisma.doctor.findUnique({ where: { id: data.doctorId! } });
  if (!doc) return adapter.sendText(userId, MSG.error);

  const { available } = await getAvailableSlots(doc, date);
  if (!available.length) return adapter.sendText(userId, MSG.noSlotsForDay);

  data.date = date;
  const d = new Date(date);
  const labelAr = `${d.toLocaleDateString('ar-SA', { weekday: 'long', day: 'numeric', month: 'long' })}`;
  const labelEn = `${d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' })}`;

  await setSession(userId, 'select_time', data);
  const sections: ListSection[] = [{ title: `${labelAr} / ${labelEn}`, rows: available.slice(0, 10).map(t => ({
    id: `time_${t}`,
    title: t,
  }))}];
  return adapter.sendList(userId, '🕐 اختر الوقت / Choose Time', MSG.selectTime(labelAr, labelEn), 'اختر / Choose', sections);
}

// ─── Time ─────────────────────────────────────────────────────────────────────
async function handleTime(userId: string, data: BookingData, input: string, adapter: BotAdapter) {
  if (!input.startsWith('time_')) return adapter.sendText(userId, MSG.error);
  const t = input.replace('time_', '');
  if (!/^\d{2}:\d{2}$/.test(t)) return adapter.sendText(userId, MSG.error);
  data.time = t;
  await setSession(userId, 'ask_name', data);
  return adapter.sendText(userId, MSG.askName);
}

// ─── Name (the ONLY required free-text step — English letters only) ─────────
async function handleName(userId: string, data: BookingData, input: string, adapter: BotAdapter) {
  const trimmed = input.trim();

  if (['cancel', 'إلغاء'].includes(trimmed.toLowerCase())) {
    await clearSession(userId);
    return adapter.sendText(userId, MSG.cancelled);
  }

  if (!isValidEnglishName(trimmed)) {
    // Distinguish "wrong script/characters" from "only one word" so the
    // patient gets a precise hint instead of a generic error every time.
    if (!/^[A-Za-z '\-]+$/.test(trimmed)) {
      return adapter.sendText(userId, MSG.nameInvalidNotEnglish);
    }
    return adapter.sendText(userId, MSG.nameTooShort);
  }

  data.name = trimmed;
  // Instagram: ask for WhatsApp number next. WhatsApp: go straight to call time.
  const nextStep = userId.startsWith('ig_') ? 'ask_whatsapp' : 'ask_call_time';
  await setSession(userId, nextStep, data);
  if (nextStep === 'ask_whatsapp') return adapter.sendText(userId, MSG.askWhatsapp);
  return sendCallTimePicker(userId, adapter);
}

// ─── WhatsApp number (Instagram only — the second required free-text step) ──
async function handleWhatsapp(userId: string, data: BookingData, input: string, adapter: BotAdapter, source: BookingSource) {
  // Accept formats: 966501234567 / 0501234567 / +966501234567
  const cleaned = input.replace(/\D/g, '');
  if (cleaned.length < 9 || cleaned.length > 15) {
    return adapter.sendText(userId, MSG.invalidWhatsapp);
  }
  data.whatsappNumber = cleaned.startsWith('966') ? cleaned : cleaned.startsWith('0') ? `966${cleaned.slice(1)}` : `966${cleaned}`;
  await setSession(userId, 'ask_call_time', data);
  return sendCallTimePicker(userId, adapter);
}

// ─── Call time (click-based) ─────────────────────────────────────────────────
async function sendCallTimePicker(userId: string, adapter: BotAdapter) {
  const sections: ListSection[] = [{ title: 'أفضل وقت / Best Time', rows: CALL_TIMES.map(c => ({
    id: c.id,
    title: `${c.titleAr} / ${c.titleEn}`,
    description: `${c.descAr} / ${c.descEn}`,
  }))}];
  return adapter.sendList(userId, '📞 أفضل وقت للتواصل / Best Time to Call', MSG.askCallTime, 'اختر / Choose', sections);
}

// ─── Call time → Create booking ──────────────────────────────────────────────
async function handleCallTime(userId: string, data: BookingData, input: string, adapter: BotAdapter, source: BookingSource) {
  const ct = CALL_TIMES.find(c => c.id === input);
  if (!ct) return adapter.sendText(userId, MSG.error);
  data.callTimeAr = ct.titleAr;
  data.callTimeEn = ct.titleEn;

  try {
    // Use WhatsApp number for Instagram users, userId for WhatsApp users
    const phone = source === BookingSource.instagram && data.whatsappNumber
      ? data.whatsappNumber
      : userId;

    const booking = await prisma.booking.create({
      data: {
        name:     data.name!,
        phone,
        service:  data.serviceAr!,
        date:     data.date!,
        time:     data.time!,
        doctorId: data.doctorId!,
        source,
        status:   'confirmed',
        notes:    `Best time to call: ${data.callTimeEn}${data.whatsappNumber ? ` | WhatsApp: ${data.whatsappNumber}` : ''}`,
      },
    });

    // Google Calendar sync (non-fatal)
    try {
      const doc = await prisma.doctor.findUnique({ where: { id: data.doctorId! } });
      if (doc) {
        const { createCalendarEvent } = await import('./googleCalendar');
        const cal = await createCalendarEvent(booking, doc);
        if (cal) await prisma.booking.update({ where: { id: booking.id }, data: { ...cal, calendarSynced: true } });
      }
    } catch { /* non-fatal */ }

    await clearSession(userId);

    const d = new Date(data.date!);
    const labelAr = d.toLocaleDateString('ar-SA', { weekday: 'long', day: 'numeric', month: 'long' });
    const labelEn = d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' });

    const summary = MSG.confirmationSummary(
      data.name!, data.doctorNameAr!, data.doctorNameEn!,
      data.serviceAr!, data.serviceEn!,
      labelAr, labelEn, data.time!,
      data.callTimeAr!, data.callTimeEn!
    );
    return adapter.sendText(userId, summary);
  } catch (err: unknown) {
    const e = err as { code?: string };
    if (e.code === 'P2002') return adapter.sendText(userId, MSG.slotTaken);
    console.error('Bot booking error:', err);
    return adapter.sendText(userId, MSG.error);
  }
}
