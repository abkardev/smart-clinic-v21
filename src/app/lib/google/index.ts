export {
  getAuthUrl,
  exchangeCode,
  getDoctorAuthUrl,
  exchangeDoctorCode,
  createDoctorClient,
  setDoctorClient,
  getDoctorClient,
  removeDoctorClient,
} from './auth';

export {
  getGoogleCalendar,
  getDoctorCalendar,
  createCalendarClient,
} from './calendar';

export type { OAuth2Client } from './auth';
