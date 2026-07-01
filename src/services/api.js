import axios from 'axios';

const api = axios.create({ baseURL: '/api' });

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
export const authResetPassword  = (data) => api.post('/auth/reset-password', data);

export const getDashboardStats = () => api.get('/dashboard/stats');

export const getDoctors      = () => api.get('/doctors');
export const createDoctor    = (data) => api.post('/doctors', data);
export const updateDoctor    = (id, data) => api.put(`/doctors/${id}`, data);
export const deleteDoctor    = (id) => api.delete(`/doctors/${id}`);
export const syncFromGoogle  = () => api.post('/doctors/sync-google');
export const syncAllDoctors  = () => api.post('/doctors/sync-all');

export const getBookings     = (params) => api.get('/bookings', { params });
export const createBooking   = (data) => api.post('/bookings', data);
export const updateBooking   = (id, data) => api.put(`/bookings/${id}`, data);
export const deleteBooking   = (id) => api.delete(`/bookings/${id}`);
export const sendReminder    = (id) => api.post(`/whatsapp/reminder/${id}`);
export const dragDropBooking = (id, data) => api.patch(`/bookings/${id}/drag-drop`, data);

export const getBlockedSlots = (params) => api.get('/blocked-slots', { params });
export const blockSlot       = (data) => api.post('/blocked-slots', data);
export const unblockSlot     = (id) => api.delete(`/blocked-slots/${id}`);

export const getUsers           = (params) => api.get('/users', { params });
export const updateUserStatus   = (id, data) => api.patch(`/users/${id}/status`, data);
export const updateUserRole     = (id, data) => api.patch(`/users/${id}/role`, data);
export const deleteUser         = (id) => api.delete(`/users/${id}`);

export const getOffers     = () => api.get('/offers');
export const createOffer   = (data) => api.post('/offers', data);
export const updateOffer   = (id, data) => api.put(`/offers/${id}`, data);
export const deleteOffer   = (id) => api.delete(`/offers/${id}`);

export const getHolidays   = () => api.get('/holidays');
export const createHoliday = (data) => api.post('/holidays', data);
export const deleteHoliday = (id) => api.delete(`/holidays/${id}`);

export const getAuditLogs  = (params) => api.get('/audit-logs', { params });
