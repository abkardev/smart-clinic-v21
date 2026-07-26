import { google as googleApis } from 'googleapis';

export type OAuth2Client = InstanceType<typeof googleApis.auth.OAuth2>;

let _auth: OAuth2Client | undefined;
let _calendar: ReturnType<typeof googleApis.calendar> | undefined;

function getAuth(): OAuth2Client {
  if (!_auth) {
    _auth = new googleApis.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI,
    );
    _auth.setCredentials({
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
    });
  }
  return _auth;
}

export function getGoogleCalendar() {
  if (!_calendar) {
    _calendar = googleApis.calendar({ version: 'v3', auth: getAuth() });
  }
  return _calendar;
}

const doctorClients = new Map<string, OAuth2Client>();

export function getAuthUrl(): string {
  return getAuth().generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/calendar'],
    prompt: 'consent',
  });
}

export async function exchangeCode(code: string) {
  const { tokens } = await getAuth().getToken(code);
  return tokens;
}

export function getDoctorAuthUrl(redirectUri: string): string {
  const oauth = new googleApis.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    redirectUri,
  );
  return oauth.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/calendar'],
    prompt: 'consent',
    state: Buffer.from(redirectUri).toString('base64'),
  });
}

export async function exchangeDoctorCode(code: string, redirectUri: string) {
  const oauth = new googleApis.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    redirectUri,
  );
  const { tokens } = await oauth.getToken(code);
  return { tokens, client: oauth };
}

export function createDoctorClient(
  accessToken: string,
  refreshToken: string,
  expiresAt?: Date,
) {
  const oauth = new googleApis.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI,
  );
  oauth.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
    expiry_date: expiresAt?.getTime(),
  });
  return oauth;
}

export function getDoctorCalendar(doctorId: string) {
  const client = doctorClients.get(doctorId);
  if (!client) return null;
  return googleApis.calendar({ version: 'v3', auth: client });
}

export function setDoctorClient(doctorId: string, client: OAuth2Client): void {
  doctorClients.set(doctorId, client);
}

export function getDoctorClient(doctorId: string): OAuth2Client | undefined {
  return doctorClients.get(doctorId);
}

export function removeDoctorClient(doctorId: string): void {
  doctorClients.delete(doctorId);
}
