export const CALL_TIMES = [
  { id: 'call_morning', titleAr: '🌅 الصباح',  titleEn: 'Morning',  descAr: '٨ ص – ١٢ م',  descEn: '8 AM – 12 PM' },
  { id: 'call_noon',    titleAr: '☀️ الظهيرة', titleEn: 'Afternoon', descAr: '١٢ م – ٤ م',  descEn: '12 PM – 4 PM' },
  { id: 'call_evening', titleAr: '🌆 المساء',  titleEn: 'Evening',   descAr: '٤ م – ٨ م',   descEn: '4 PM – 8 PM' },
];

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
  whatsappNumber?: string;
  previousStep?: string;
  editReturn?: string;
  editField?: string;
  existingBookingId?: string;
  offersPage?: number;
}

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

  bookingSummary: (
    name: string, doctorAr: string, doctorEn: string,
    serviceAr: string, serviceEn: string,
    dateLabelAr: string, dateLabelEn: string, time: string,
    callAr: string, callEn: string
  ) => bi(
    `📋 *ملخص الحجز*\n\n` +
    `👤 *الاسم:* ${name}\n` +
    `👨‍⚕️ *الطبيب:* د. ${doctorAr}\n` +
    `💊 *الخدمة:* ${serviceAr}\n` +
    `📅 *التاريخ:* ${dateLabelAr}\n` +
    `🕐 *الوقت:* ${time}\n` +
    `📞 *وقت الاتصال:* ${callAr}\n\n` +
    `اختر من الأسفل:`,
    `📋 *Booking Summary*\n\n` +
    `👤 *Name:* ${name}\n` +
    `👨‍⚕️ *Doctor:* Dr. ${doctorEn}\n` +
    `💊 *Service:* ${serviceEn}\n` +
    `📅 *Date:* ${dateLabelEn}\n` +
    `🕐 *Time:* ${time}\n` +
    `📞 *Call Time:* ${callEn}\n\n` +
    `Choose below:`
  ),

  bookingEditOptions: bi(
    'اختر الحقل الذي تريد تعديله:',
    'Choose the field you want to edit:'
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

  pleaseUseButtons: bi(
    'يرجى استخدام الأزرار أدناه للمتابعة.',
    'Please use the buttons below to continue.'
  ),

  sessionExpired: bi(
    '⏰ انتهت صلاحية الجلسة. تم حفظ المسودة. أرسل *مرحبا* للبدء من جديد.',
    '⏰ Session expired. Draft saved. Send *hello* to start a new booking.'
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
    locationAr: '📍 موقع العيادة', locationEn: 'Clinic Location',
    myBookingAr: '🔍 موعدي', myBookingEn: 'My Booking',
  },

  contactInfo: bi(
    '📞 *تواصل معنا*\n☎️ هاتف: 920XXXXXXX\n✉️ info@smartclinic.sa\n📍 *الموقع:* https://maps.google.com/?q=SmartClinic+Riyadh\nأوقات العمل: الأحد – الخميس، ٩ ص – ٥ م',
    '📞 *Contact Us*\n☎️ Phone: 920XXXXXXX\n✉️ info@smartclinic.sa\n📍 *Location:* https://maps.google.com/?q=SmartClinic+Riyadh\nWorking hours: Sun – Thu, 9 AM – 5 PM'
  ),

  locationInfo: bi(
    '📍 *موقع العيادة*\n🏥 *SmartClinic*\n📌 حي العليا، شارع الإمام سعود بن عبدالعزيز\n📍 https://maps.google.com/?q=SmartClinic+Riyadh\n\nأوقات العمل:\nالأحد – الخميس: ٩ ص – ٥ م\nالجمعة – السبت: مغلق',
    '📍 *Clinic Location*\n🏥 *SmartClinic*\n📌 Al Olaya District, Imam Saud bin Abdulaziz Road\n📍 https://maps.google.com/?q=SmartClinic+Riyadh\n\nWorking hours:\nSunday – Thursday: 9 AM – 5 PM\nFriday – Saturday: Closed'
  ),

  preVisitInstructions: bi(
    '📋 *تعليمات ما قبل الزيارة*\n\n• يرجى الحضور قبل الموعد بـ ١٠ دقائق\n• أحضر هويتك الشخصية\n• أحضر أي تقارير طبية سابقة أو تحاليل\n• إذا كان موعدك لتحاليل، يرجى الصيام ٨ ساعات قبل الموعد',
    '📋 *Pre-Visit Instructions*\n\n• Please arrive 10 minutes before your appointment\n• Bring your ID\n• Bring any previous medical reports or test results\n• If your appointment is for lab tests, please fast for 8 hours prior'
  ),

  // ── Patient Self-Service ───────────────────────────────────────────────────
  existingBookingFound: (date: string, time: string, doctor: string) =>
    bi(
      `👋 *مرحباً بعودتك!*\nلديك موعد قادم:\n📅 ${date}\n🕐 ${time}\n👨‍⚕️ د. ${doctor}\n\nماذا تريد أن تفعل؟`,
      `👋 *Welcome back!*\nYou have an upcoming appointment:\n📅 ${date}\n🕐 ${time}\n👨‍⚕️ Dr. ${doctor}\n\nWhat would you like to do?`
    ),

  cancelConfirm: bi(
    'هل أنت متأكد من إلغاء الموعد؟',
    'Are you sure you want to cancel this appointment?'
  ),

  cancelledSuccess: bi(
    '✅ *تم إلغاء الموعد بنجاح.*\nيمكنك حجز موعد جديد في أي وقت بإرسال *مرحبا*.',
    '✅ *Appointment cancelled successfully.*\nYou can book a new appointment anytime by sending *hello*.'
  ),

  rescheduleSelectDate: bi(
    '📅 *اختر اليوم الجديد لموعدك:*',
    '📅 *Choose your new appointment day:*'
  ),

  noFutureBooking: bi(
    'ليس لديك أي مواعيد قادمة.\nأرسل *مرحبا* لحجز موعد جديد.',
    'You have no upcoming appointments.\nSend *hello* to book a new appointment.'
  ),

  myBookingCancelled: bi(
    'تم إلغاء الموعد من قبل المريض',
    'Booking cancelled by patient'
  ),
};

export const TRIGGERS = [
  'مرحبا', 'مرحباً', 'احجز', 'هلا', 'السلام عليكم', 'اهلا', 'أهلا', 'رئيسية',
  'hi', 'hello', 'hey', 'start', 'book', 'menu',
];

export const NAVIGATION_IDS = new Set(['back', 'main_menu', 'cancel']);

export const SUMMARY_IDS = new Set([
  'confirm_booking', 'edit_booking', 'cancel_booking',
  'edit_doctor', 'edit_service', 'edit_datetime', 'edit_name', 'edit_calltime',
]);

export const STEP_ORDER: Record<string, string> = {
  main_menu: '',
  select_doctor: 'main_menu',
  select_service: 'select_doctor',
  select_date: 'select_service',
  select_time: 'select_date',
  ask_name: 'select_time',
  ask_whatsapp: 'ask_name',
  ask_call_time: 'ask_name',
  booking_summary: 'ask_call_time',
};

export const EDIT_FIELD_MAP: Record<string, string> = {
  edit_doctor: 'select_doctor',
  edit_service: 'select_service',
  edit_datetime: 'select_date',
  edit_name: 'ask_name',
  edit_calltime: 'ask_call_time',
};
