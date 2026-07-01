export const translations = {
  en: {
    // Nav
    dashboard: 'Dashboard', bookings: 'Bookings', doctors: 'Doctors',
    calendar: 'Calendar', users: 'Users', auditLogs: 'Audit Logs',
    slotManager: 'Slot Manager', analytics: 'Analytics', adminPortal: 'Admin Portal', logout: 'Sign Out',

    // Auth
    login: 'Sign In', register: 'Create Account', forgotPassword: 'Forgot Password',
    resetPassword: 'Reset Password', email: 'Email Address', password: 'Password',
    confirmPassword: 'Confirm Password', fullName: 'Full Name', role: 'Role',
    signIn: 'Sign In', createAccount: 'Create Account', sendResetLink: 'Send Reset Link',
    backToLogin: 'Back to Sign In', dontHaveAccount: "Don't have an account?",
    haveAccount: 'Already have an account?',
    registrationSuccess: 'Registration submitted! Awaiting admin approval.',
    resetLinkSent: 'Reset link sent. Check your email.',
    passwordMismatch: 'Passwords do not match',
    passwordUpdated: 'Password updated! You can now sign in.',
    accountPending: 'Your account is pending admin approval.',
    welcomeBack: 'Welcome back',

    // Dashboard
    totalBookings: 'Total Bookings', todayAppointments: "Today's Appointments",
    activeDoctors: 'Active Doctors', whatsappBookings: 'WhatsApp Bookings', instagramBookings: 'Instagram Bookings',
    bookingsByStatus: 'Bookings by Status', bookingsByDoctor: 'Bookings by Doctor',
    recentBookings: 'Recent Bookings', viaBot: 'via bot',
    thisMonth: 'This Month', noBookingsYet: 'No bookings yet',

    // Bookings
    newBooking: 'New Booking', patient: 'Patient', phone: 'Phone', service: 'Service',
    doctor: 'Doctor', date: 'Date', time: 'Time', status: 'Status', notes: 'Notes',
    actions: 'Actions', filterStatus: 'Filter Status', syncGoogle: 'Sync Google',
    sendReminder: 'Send Reminder', edit: 'Edit', delete: 'Delete', save: 'Save', cancel: 'Cancel',
    all: 'All', pending: 'Pending', confirmed: 'Confirmed', completed: 'Completed',
    cancelled: 'Cancelled', 'no-show': 'No Show', noShow: 'No Show',
    sortBy: 'Sort By', filterByService: 'Filter by Service', filterByDoctor: 'Filter by Doctor',
    source: 'Source', whatsapp: 'WhatsApp', instagram: 'Instagram', manual: 'Manual',
    bookingCreated: 'Booking created successfully', bookingUpdated: 'Booking updated',
    bookingDeleted: 'Booking deleted', reminderSent: 'Reminder sent!',

    // Doctors
    addDoctor: 'Add Doctor', specialty: 'Specialty', calendarId: 'Google Calendar ID',
    workingHours: 'Working Hours', startTime: 'Start Time', endTime: 'End Time',
    slotDuration: 'Slot Duration (min)', active: 'Active', inactive: 'Inactive',
    deactivate: 'Deactivate', doctorName: 'Doctor Name', phoneNumber: 'Phone', emailAddr: 'Email',
    noDoctors: 'No doctors yet. Add your first doctor!',

    // Calendar
    selectDoctor: 'Select Doctor', allDoctors: 'All Doctors',
    viewInGoogle: 'View in Google Calendar →', blockedSlotLabel: 'Blocked',
    movedTo: 'Appointment moved to',

    // Users
    userManagement: 'User Management', approve: 'Approve', reject: 'Reject', suspend: 'Suspend',
    approved: 'Approved', rejected: 'Rejected', suspended: 'Suspended',
    pendingApproval: 'Pending Approval', lastLogin: 'Last Login', registeredAt: 'Registered',
    changeRole: 'Change Role', deleteUser: 'Delete User', noUsers: 'No users found',
    usersAwaitingApproval: 'user(s) awaiting your approval',
    confirmApprove: 'Are you sure you want to approve this user?',

    // Audit Logs
    action: 'Action', user: 'User', entity: 'Entity', details: 'Details',
    timestamp: 'Timestamp', filterByAction: 'Filter by Action', filterByUser: 'Filter by User',
    success: 'Success', failure: 'Failure', fromDate: 'From Date', toDate: 'To Date',
    filterOptions: 'Filter Options', noLogs: 'No audit logs found',

    // Slot Manager
    blockSlot: 'Block Slot', unblock: 'Unblock', blockedSlots: 'Blocked Slots',
    wholeDay: 'Block Whole Day', reason: 'Reason (optional)',
    available: 'Available', blocked: 'Blocked', booked: 'Booked',
    clickToBlock: 'Click a slot to block/unblock it',
    wholeDayBlocked: 'This entire day is blocked',
    unblockDay: 'Unblock Day',

    // Common
    loading: 'Loading...', noData: 'No data found', confirm: 'Confirm',
    deleteConfirm: 'Are you sure you want to delete this?', yes: 'Yes', no: 'No',
    search: 'Search', clear: 'Clear', apply: 'Apply',
    superadmin: 'Super Admin', admin: 'Admin', admin2: 'Administrator',
    viewDetails: 'View Details', close: 'Close', refresh: 'Refresh',
    of: 'of', page: 'Page',
  },

  ar: {
    // Nav
    dashboard: 'لوحة التحكم', bookings: 'الحجوزات', doctors: 'الأطباء',
    calendar: 'التقويم', users: 'المستخدمون', auditLogs: 'سجل الأحداث',
    slotManager: 'إدارة المواعيد', analytics: 'التحليلات', adminPortal: 'بوابة المشرف', logout: 'تسجيل الخروج',

    // Auth
    login: 'تسجيل الدخول', register: 'إنشاء حساب', forgotPassword: 'نسيت كلمة المرور',
    resetPassword: 'إعادة تعيين كلمة المرور', email: 'البريد الإلكتروني', password: 'كلمة المرور',
    confirmPassword: 'تأكيد كلمة المرور', fullName: 'الاسم الكامل', role: 'الدور',
    signIn: 'دخول', createAccount: 'إنشاء حساب', sendResetLink: 'إرسال رابط الاسترداد',
    backToLogin: 'العودة لتسجيل الدخول', dontHaveAccount: 'ليس لديك حساب؟',
    haveAccount: 'لديك حساب بالفعل؟',
    registrationSuccess: 'تم إرسال طلب التسجيل! في انتظار موافقة المشرف.',
    resetLinkSent: 'تم إرسال رابط الاسترداد. تحقق من بريدك الإلكتروني.',
    passwordMismatch: 'كلمتا المرور غير متطابقتين',
    passwordUpdated: 'تم تحديث كلمة المرور! يمكنك الآن تسجيل الدخول.',
    accountPending: 'حسابك في انتظار موافقة المشرف.',
    welcomeBack: 'مرحباً بعودتك',

    // Dashboard
    totalBookings: 'إجمالي الحجوزات', todayAppointments: 'مواعيد اليوم',
    activeDoctors: 'الأطباء النشطون', whatsappBookings: 'حجوزات واتساب', instagramBookings: 'حجوزات إنستجرام',
    bookingsByStatus: 'الحجوزات حسب الحالة', bookingsByDoctor: 'الحجوزات حسب الطبيب',
    recentBookings: 'آخر الحجوزات', viaBot: 'عبر البوت',
    thisMonth: 'هذا الشهر', noBookingsYet: 'لا توجد حجوزات بعد',

    // Bookings
    newBooking: 'حجز جديد', patient: 'المريض', phone: 'الهاتف', service: 'الخدمة',
    doctor: 'الطبيب', date: 'التاريخ', time: 'الوقت', status: 'الحالة', notes: 'ملاحظات',
    actions: 'الإجراءات', filterStatus: 'فلتر الحالة', syncGoogle: 'مزامنة جوجل',
    sendReminder: 'إرسال تذكير', edit: 'تعديل', delete: 'حذف', save: 'حفظ', cancel: 'إلغاء',
    all: 'الكل', pending: 'قيد الانتظار', confirmed: 'مؤكد', completed: 'مكتمل',
    cancelled: 'ملغي', 'no-show': 'لم يحضر', noShow: 'لم يحضر',
    sortBy: 'ترتيب حسب', filterByService: 'فلتر بالخدمة', filterByDoctor: 'فلتر بالطبيب',
    source: 'المصدر', whatsapp: 'واتساب', instagram: 'إنستجرام', manual: 'يدوي',
    bookingCreated: 'تم إنشاء الحجز بنجاح', bookingUpdated: 'تم تحديث الحجز',
    bookingDeleted: 'تم حذف الحجز', reminderSent: 'تم إرسال التذكير!',

    // Doctors
    addDoctor: 'إضافة طبيب', specialty: 'التخصص', calendarId: 'معرف تقويم جوجل',
    workingHours: 'ساعات العمل', startTime: 'وقت البداية', endTime: 'وقت النهاية',
    slotDuration: 'مدة الموعد (دقيقة)', active: 'نشط', inactive: 'غير نشط',
    deactivate: 'إيقاف تفعيل', doctorName: 'اسم الطبيب', phoneNumber: 'الهاتف', emailAddr: 'البريد الإلكتروني',
    noDoctors: 'لا يوجد أطباء بعد. أضف أول طبيب!',

    // Calendar
    selectDoctor: 'اختر الطبيب', allDoctors: 'جميع الأطباء',
    viewInGoogle: 'عرض في تقويم جوجل ←', blockedSlotLabel: 'محظور',
    movedTo: 'تم نقل الموعد إلى',

    // Users
    userManagement: 'إدارة المستخدمين', approve: 'موافقة', reject: 'رفض', suspend: 'تعليق',
    approved: 'موافق عليه', rejected: 'مرفوض', suspended: 'معلق',
    pendingApproval: 'قيد المراجعة', lastLogin: 'آخر دخول', registeredAt: 'تاريخ التسجيل',
    changeRole: 'تغيير الدور', deleteUser: 'حذف المستخدم', noUsers: 'لا يوجد مستخدمون',
    usersAwaitingApproval: 'مستخدم بانتظار موافقتك',
    confirmApprove: 'هل أنت متأكد من الموافقة على هذا المستخدم؟',

    // Audit Logs
    action: 'الإجراء', user: 'المستخدم', entity: 'الكيان', details: 'التفاصيل',
    timestamp: 'الوقت', filterByAction: 'فلتر بالإجراء', filterByUser: 'فلتر بالمستخدم',
    success: 'نجح', failure: 'فشل', fromDate: 'من تاريخ', toDate: 'إلى تاريخ',
    filterOptions: 'خيارات الفلتر', noLogs: 'لا توجد سجلات',

    // Slot Manager
    blockSlot: 'حظر الوقت', unblock: 'إلغاء الحظر', blockedSlots: 'الأوقات المحظورة',
    wholeDay: 'حظر اليوم كله', reason: 'السبب (اختياري)',
    available: 'متاح', blocked: 'محظور', booked: 'محجوز',
    clickToBlock: 'انقر على موعد لحظره أو إلغاء حظره',
    wholeDayBlocked: 'هذا اليوم محظور بالكامل',
    unblockDay: 'إلغاء حظر اليوم',

    // Common
    loading: 'جارٍ التحميل...', noData: 'لا توجد بيانات', confirm: 'تأكيد',
    deleteConfirm: 'هل أنت متأكد من الحذف؟', yes: 'نعم', no: 'لا',
    search: 'بحث', clear: 'مسح', apply: 'تطبيق',
    superadmin: 'مشرف عام', admin: 'مشرف', admin2: 'مدير',
    viewDetails: 'عرض التفاصيل', close: 'إغلاق', refresh: 'تحديث',
    of: 'من', page: 'صفحة',
  },
};
