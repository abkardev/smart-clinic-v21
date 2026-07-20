export const STATUS_COLORS: Record<string, string> = {
  pending: '#ffa726',
  confirmed: '#1a73e8',
  completed: '#34a853',
  cancelled: '#ef5350',
  'no-show': '#ab47bc',
  no_show: '#ab47bc',
};

export const MUI_STATUS_COLORS: Record<string, string> = {
  pending: 'warning',
  confirmed: 'info',
  completed: 'success',
  cancelled: 'error',
  'no_show': 'secondary',
  'no-show': 'secondary',
};

export const STATUS_LABEL_EN: Record<string, string> = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  completed: 'Completed',
  cancelled: 'Cancelled',
  'no-show': 'No Show',
  no_show: 'No Show',
};

export const STATUS_LABEL_AR: Record<string, string> = {
  pending: 'قيد الانتظار',
  confirmed: 'مؤكد',
  completed: 'مكتمل',
  cancelled: 'ملغي',
  'no-show': 'لم يحضر',
  no_show: 'لم يحضر',
};

export const SERVICES_EN = [
  'General Consultation',
  'Follow-up',
  'Specialist Visit',
  'Lab Results Review',
  'Prescription Renewal',
];

export const SERVICES_AR = [
  'استشارة عامة',
  'متابعة',
  'زيارة متخصص',
  'مراجعة نتائج مختبر',
  'تجديد وصفة',
];

export const DOCTOR_SELECT = {
  id: true,
  nameEn: true,
  nameAr: true,
  specialtyEn: true,
  specialtyAr: true,
} as const;

export const STATUS_KEYS = ['pending', 'confirmed', 'completed', 'cancelled', 'no-show'];
