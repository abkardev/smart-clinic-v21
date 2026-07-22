import axios from 'axios';

const api = axios.create({ baseURL: '/api' });

export function extractArray(response) {
  return Array.isArray(response) ? response : (response?.data ?? []);
}

api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('sc_token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const authLogin        = (data) => api.post('/auth/login', data);
export const authRegister     = (data) => api.post('/auth/register', data);
export const authForgotPassword = (data) => api.post('/auth/forgot-password', data);
export const authResetPassword  = (token, data) => api.post(`/auth/reset-password/${token}`, data);

export const getDashboardStats = () => api.get('/dashboard/stats');

export const getDoctors      = () => api.get('/doctors');
export const createDoctor    = (data) => api.post('/doctors', data);
export const updateDoctor    = (id, data) => api.put(`/doctors/${id}`, data);
export const deleteDoctor    = (id) => api.delete(`/doctors/${id}`);
export const syncFromGoogle  = (doctorId) => api.post('/doctors/sync-google', { doctorId });
export const syncAllDoctors  = () => api.post('/doctors/sync-all');

export const getBookings     = (params) => api.get('/bookings', { params });
export const createBooking   = (data) => api.post('/bookings', data);
export const updateBooking   = (id, data) => api.put(`/bookings/${id}`, data);
export const deleteBooking   = (id) => api.delete(`/bookings/${id}`);
export const sendReminder        = (id) => api.post(`/whatsapp/reminder/${id}`);
export const sendEmailReminder   = (id, data) => api.post(`/email-reminder/${id}`, data);
export const dragDropBooking = (id, data) => api.patch(`/bookings/${id}/drag-drop`, data);

export const getBlockedSlots = (params) => api.get('/blocked-slots', { params });
export const blockSlot       = (data) => api.post('/blocked-slots', data);
export const unblockSlot     = (id) => api.delete(`/blocked-slots/${id}`);

export const getUsers           = (params) => api.get('/auth/users', { params });
export const updateUserStatus   = (id, status) => api.patch(`/auth/users/${id}/status`, { status });
export const updateUserRole     = (id, role) => api.patch(`/auth/users/${id}/role`, { role });
export const deleteUser         = (id) => api.delete(`/auth/users/${id}`);

export const getOffers     = () => api.get('/offers');
export const createOffer   = (data) => api.post('/offers', data);
export const updateOffer   = (id, data) => api.put(`/offers/${id}`, data);
export const deleteOffer   = (id) => api.delete(`/offers/${id}`);

export const getHolidays   = () => api.get('/holidays');
export const createHoliday = (data) => api.post('/holidays', data);
export const deleteHoliday = (id) => api.delete(`/holidays/${id}`);

export const getAuditLogs  = (params) => api.get('/audit-logs', { params });

export const getAnalyticsOverview = (params) => api.get('/analytics/overview', { params });

export const exportAppointmentsReport = (params) => api.get('/reports/appointments', { params, responseType: 'blob' });
export const exportDoctorsReport = (params) => api.get('/reports/doctors', { params, responseType: 'blob' });

// ─── Calendar Administration API ──────────────────────────────────────────────
export const getCalendarOverview = () => api.get('/calendar/overview');
export const getCalendarStatus = () => api.get('/calendar/status');
export const getCalendarStatistics = () => api.get('/calendar/statistics');
export const getCalendarActivity = (params) => api.get('/calendar/activity', { params });
export const verifyBooking = (bookingId) => api.get('/calendar/verify', { params: { bookingId } });
export const postVerifyBooking = (data) => api.post('/calendar/verify', data);
export const resyncBooking = (data) => api.post('/calendar/resync-booking', data);
export const recreateEvent = (data) => api.post('/calendar/recreate-event', data);
export const getCalendarConflicts = (params) => api.get('/calendar/conflicts', { params });
export const getCalendarDiagnostics = () => api.get('/calendar/diagnostics');
export const getCalendarObservability = () => api.get('/calendar/observability');
export const getCalendarConfig = () => api.get('/calendar/config');
export const updateCalendarConfig = (data) => api.patch('/calendar/config', data);
export const exportCalendarData = (params) => api.get('/calendar/export', { params, responseType: 'blob' });
export const runCalendarCleanup = (data) => api.post('/calendar/cleanup', data);
export const getCalendarCleanup = (params) => api.get('/calendar/cleanup', { params });
export const resyncDoctor = (data) => api.post('/calendar/resync-doctor', data);
export const fullResync = () => api.post('/calendar/full-resync');
export const renewChannels = () => api.post('/google/channels');
export const getChannels = () => api.get('/google/channels');

// ─── Scheduling API ───────────────────────────────────────────────────────────
export const getSchedulingAnalytics = (params) => api.get('/scheduling/analytics', { params });
export const getSmartAvailability = (params) => api.get('/scheduling/availability', { params });
export const getSchedulingForecast = (params) => api.get('/scheduling/forecast', { params });
export const getSchedulingOptimize = (params) => api.get('/scheduling/optimize', { params });
export const autoReschedule = (data) => api.post('/scheduling/reschedule', data);
