// Shared bilingual (Arabic + English) messages for the WhatsApp + Instagram
// bots. Every message shows Arabic first, then English, separated by a
// divider line — this is the project's chosen bilingual format.
//
// DESIGN RULE: the booking flow is click-only. The patient never has to
// type anything except their full name (English letters only) and, on
// Instagram, their WhatsApp number. Every other step is an interactive
// list the patient taps.

export const CALL_TIMES = [
  { id: 'call_morning', titleAr: '🌅 الصباح',  titleEn: 'Morning',  descAr: '٨ ص – ١٢ م',  descEn: '8 AM – 12 PM' },
  { id: 'call_noon',    titleAr: '☀️ الظهيرة', titleEn: 'Afternoon', descAr: '١٢ م – ٤ م',  descEn: '12 PM – 4 PM' },
  { id: 'call_evening', titleAr: '🌆 المساء',  titleEn: 'Evening',   descAr: '٤ م – ٨ م',   descEn: '4 PM – 8 PM' },
];

// Bilingual service catalogue — id is what gets stored, labels are shown.
export const SERVICES_BILINGUAL = [
  { id: 'svc_general',    ar: 'استشارة عامة',          en: 'General Consultation' },
  { id: 'svc_followup',   ar: 'مراجعة',                en: 'Follow-up' },
  { id: 'svc_specialist', ar: 'زيارة أخصائي',          en: 'Specialist Visit' },
  { id: 'svc_labs',       ar: 'مراجعة نتائج التحاليل', en: 'Lab Results Review' },
];

export interface BookingData {
  doctorId?: string;
  doctorNameAr?: string;
  doctorNameEn?: string;
  serviceAr?: string;
  serviceEn?: string;
  date?: string;
  time?: string;
  name?: string;
  callTimeAr?: string;
  callTimeEn?: string;
  whatsappNumber?: string; // Instagram only
}

// Joins an Arabic line and an English line with a divider, the project's
// chosen bilingual message format.
function bi(ar: string, en: string): string {
  return `${ar}\n— — —\n${en}`;
}

export const MSG = {
  welcome: (c = 'SmartClinic') =>
    bi(
      `🏥 *أهلاً وسهلاً في ${c}!*\nيسعدنا خدمتك. اختر ما يناسبك من القائمة:`,
      `🏥 *Welcome to ${c}!*\nPlease choose an option from the list:`
    ),

  selectDoctor: bi('👨‍⚕️ *اختر الطبيب المناسب لك:*', '👨‍⚕️ *Please choose your doctor:*'),

  selectService: (nameAr: string, nameEn: string) =>
    bi(
      `✅ اخترت *الدكتور ${nameAr}*\n💊 *ما الخدمة التي تحتاجها؟*`,
      `✅ You selected *Dr. ${nameEn}*\n💊 *Which service do you need?*`
    ),

  selectDate: bi(
    '📅 *اختر يوم موعدك من القائمة:*',
    '📅 *Please choose your appointment day from the list:*'
  ),

  noUpcomingAvailability: bi(
    '😔 لا توجد مواعيد متاحة للأيام القادمة. يرجى المحاولة لاحقاً أو التواصل معنا مباشرة.',
    '😔 No appointments available for the upcoming days. Please try again later or contact us directly.'
  ),

  selectTime: (labelAr: string, labelEn: string) =>
    bi(`🕐 *اختر وقت موعدك ليوم ${labelAr}:*`, `🕐 *Choose a time for ${labelEn}:*`),

  noSlotsForDay: bi(
    '❌ عذراً، تم حجز كل المواعيد لهذا اليوم. يرجى اختيار يوم آخر.',
    '❌ Sorry, this day is fully booked. Please choose another day.'
  ),

  askName: bi(
    '📝 *الخطوة الأخيرة تقريباً!*\nيرجى كتابة *اسمك الكامل بالأحرف الإنجليزية فقط* لتأكيد الحجز.\nمثال: Mohammed Alotaibi',
    '📝 *Almost done!*\nPlease type your *full name in English letters only* to confirm your booking.\nExample: Mohammed Alotaibi'
  ),

  nameInvalidNotEnglish: bi(
    '⚠️ يرجى كتابة الاسم بالأحرف الإنجليزية فقط (a-z)، بدون أرقام أو رموز.\nمثال: Sara Alqahtani',
    '⚠️ Please type your name using English letters only (a-z), no numbers or symbols.\nExample: Sara Alqahtani'
  ),

  nameTooShort: bi(
    '⚠️ يرجى كتابة الاسم الكامل (الأول والأخير على الأقل).',
    '⚠️ Please enter your full name (at least first and last name).'
  ),

  askCallTime: bi(
    '📞 *ما أفضل وقت للتواصل معك؟*\nسنتصل لتأكيد موعدك — اختر من القائمة:',
    '📞 *What is the best time to contact you?*\nWe will call to confirm your appointment — please choose from the list:'
  ),

  askWhatsapp: bi(
    '📱 *آخر خطوة:* اكتب رقم واتساب للتواصل معك (أرقام فقط).\nمثال: 0501234567',
    '📱 *Last step:* please type your WhatsApp number (numbers only).\nExample: 0501234567'
  ),

  invalidWhatsapp: bi(
    '⚠️ رقم الواتساب غير صحيح. يرجى كتابة أرقام فقط، مثال: 0501234567',
    '⚠️ Invalid WhatsApp number. Please enter numbers only, e.g. 0501234567'
  ),

  confirmationSummary: (
    name: string, doctorAr: string, doctorEn: string,
    serviceAr: string, serviceEn: string,
    dateLabelAr: string, dateLabelEn: string, time: string,
    callAr: string, callEn: string
  ) =>
    bi(
      `✅ *تم تأكيد حجزك!*\n\n` +
      `👤 *الاسم:* ${name}\n` +
      `👨‍⚕️ *الطبيب:* د. ${doctorAr}\n` +
      `💊 *الخدمة:* ${serviceAr}\n` +
      `📅 *التاريخ:* ${dateLabelAr}\n` +
      `🕐 *الوقت:* ${time}\n` +
      `📞 *أفضل وقت للتواصل:* ${callAr}\n\n` +
      `سيتصل بك فريقنا قريباً. شكراً لثقتك! 💙`,
      `✅ *Your booking is confirmed!*\n\n` +
      `👤 *Name:* ${name}\n` +
      `👨‍⚕️ *Doctor:* Dr. ${doctorEn}\n` +
      `💊 *Service:* ${serviceEn}\n` +
      `📅 *Date:* ${dateLabelEn}\n` +
      `🕐 *Time:* ${time}\n` +
      `📞 *Best time to call:* ${callEn}\n\n` +
      `Our team will call you shortly. Thank you! 💙`
    ),

  reminder: (name: string, doctorAr: string, doctorEn: string, serviceAr: string, serviceEn: string, date: string, time: string) =>
    bi(
      `⏰ *تذكير بموعدك*\nعزيزي *${name}*:\n` +
      `👨‍⚕️ *الطبيب:* د. ${doctorAr}\n💊 *الخدمة:* ${serviceAr}\n📅 *التاريخ:* ${date}\n🕐 *الوقت:* ${time}\n\n` +
      `يرجى الحضور قبل ١٠ دقائق. 💙`,
      `⏰ *Appointment Reminder*\nDear *${name}*:\n` +
      `👨‍⚕️ *Doctor:* Dr. ${doctorEn}\n💊 *Service:* ${serviceEn}\n📅 *Date:* ${date}\n🕐 *Time:* ${time}\n\n` +
      `Please arrive 10 minutes early. 💙`
    ),

  slotTaken: bi(
    '❌ تم حجز هذا الموعد للتو من قبل شخص آخر. أرسل *مرحبا* لاختيار موعد آخر.',
    '❌ This slot was just booked by someone else. Send *hello* to choose another time.'
  ),

  cancelled: bi(
    '🔄 تم الإلغاء. أرسل *مرحبا* لبدء حجز جديد.',
    '🔄 Cancelled. Send *hello* to start a new booking.'
  ),

  error: bi(
    '⚠️ حدث خطأ. يرجى المحاولة مجدداً، أو أرسل *مرحبا* للبدء من جديد.',
    '⚠️ Something went wrong. Please try again, or send *hello* to restart.'
  ),

  notFound: bi(
    'أرسل *مرحبا* أو *Hello* لبدء حجز جديد.',
    'Send *Hello* to start a new booking.'
  ),

  noDoctors: bi(
    '⚠️ لا يوجد أطباء متاحون حالياً.',
    '⚠️ No doctors are currently available.'
  ),

  noOffers: bi(
    '😔 لا توجد عروض متاحة حالياً. تابعونا!',
    '😔 No offers available right now. Stay tuned!'
  ),

  offersHeaderAr: '🎁 *عروضنا الحالية:*\n\n',
  offersHeaderEn: '🎁 *Our Current Offers:*\n\n',
  offersFooter: bi(
    'اضغط الزر أدناه للحجز.',
    'Tap the button below to book.'
  ),

  menuOptions: {
    bookAr: '📅 حجز موعد',     bookEn: 'Book Appointment',
    offersAr: '🎁 العروض',     offersEn: 'Offers',
    contactAr: '📞 تواصل معنا', contactEn: 'Contact Us',
  },

  contactInfo: bi(
    '📞 *تواصل معنا*\n☎️ هاتف: 920XXXXXXX\n✉️ info@smartclinic.sa\nأوقات العمل: الأحد – الخميس، ٩ ص – ٥ م',
    '📞 *Contact Us*\n☎️ Phone: 920XXXXXXX\n✉️ info@smartclinic.sa\nWorking hours: Sun – Thu, 9 AM – 5 PM'
  ),
};

// Greeting triggers — case-insensitive substring match against the raw
// incoming message. Covers Arabic and English greetings/booking intents.
export const TRIGGERS = [
  'مرحبا', 'مرحباً', 'احجز', 'هلا', 'السلام عليكم', 'اهلا', 'أهلا', 'رئيسية',
  'hi', 'hello', 'hey', 'start', 'book', 'menu',
];
