import { getAuth, getDoctorClient } from './auth';
import type { OAuth2Client } from './auth';

interface ApiError {
  code?: number;
  status?: number;
  message?: string;
}

function throwApiError(res: Response, body: Record<string, unknown>): never {
  const apiError = (body.error as ApiError) || {};
  const err = new Error((apiError.message as string) || res.statusText) as Error & ApiError;
  err.code = (apiError.code as number) || res.status;
  err.status = (apiError.code as number) || res.status;
  throw err;
}

async function googleApiRequest<T>(
  method: string,
  path: string,
  body?: Record<string, unknown>,
  auth?: OAuth2Client,
): Promise<T> {
  const client = auth || getAuth();
  const { token } = await client.getAccessToken();
  if (!token) throw new Error('No access token available');

  const url = `https://www.googleapis.com/calendar/v3/${path}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({})) as Record<string, unknown>;
    throwApiError(res, errBody);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export interface CalendarClient {
  events: {
    insert(opts: { calendarId: string; requestBody?: Record<string, unknown> }): Promise<{ data: Record<string, unknown> }>;
    list(opts: Record<string, unknown>): Promise<{ data: { items: Record<string, unknown>[]; nextSyncToken?: string; nextPageToken?: string } }>;
    update(opts: { calendarId: string; eventId: string; requestBody?: Record<string, unknown> }): Promise<{ data: Record<string, unknown> }>;
    delete(opts: { calendarId: string; eventId: string }): Promise<void>;
    get(opts: { calendarId: string; eventId: string }): Promise<{ data: Record<string, unknown> }>;
    patch(opts: { calendarId: string; eventId: string; requestBody?: Record<string, unknown>; conferenceDataVersion?: number }): Promise<{ data: Record<string, unknown> }>;
    watch(opts: { calendarId: string; requestBody: { id: string; type: string; address: string; expiration?: string; token?: string } }): Promise<{ data: { resourceId?: string; expiration?: string } }>;
  };
  channels: {
    stop(opts: { requestBody: { id: string; resourceId: string } }): Promise<void>;
  };
  freebusy: {
    query(opts: { requestBody: { timeMin: string; timeMax: string; items: Array<{ id: string }> } }): Promise<{ data: { calendars: Record<string, { busy: Array<{ start: string; end: string }> }> } }>;
  };
  calendarList: {
    list(): Promise<{ data: { items?: Array<{ id?: string; primary?: boolean }> } }>;
  };
}

function buildCalendarClient(auth?: OAuth2Client): CalendarClient {
  return {
    events: {
      insert: (opts) =>
        googleApiRequest('POST', `calendars/${encodeURIComponent(opts.calendarId)}/events`, opts.requestBody, auth)
          .then((data) => ({ data: data as Record<string, unknown> })),
      list: (opts) => {
        const { calendarId, ...params } = opts as Record<string, unknown>;
        const qs = Object.entries(params)
          .filter(([, v]) => v !== undefined)
          .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
          .join('&');
        return googleApiRequest('GET', `calendars/${encodeURIComponent(String(calendarId))}/events${qs ? `?${qs}` : ''}`, undefined, auth)
          .then((data) => ({
            data: {
              items: ((data as Record<string, unknown>).items ?? []) as Record<string, unknown>[],
              nextSyncToken: (data as Record<string, unknown>).nextSyncToken as string | undefined,
              nextPageToken: (data as Record<string, unknown>).nextPageToken as string | undefined,
            },
          }));
      },
      update: (opts) =>
        googleApiRequest('PUT', `calendars/${encodeURIComponent(opts.calendarId)}/events/${encodeURIComponent(opts.eventId)}`, opts.requestBody, auth)
          .then((data) => ({ data: data as Record<string, unknown> })),
      delete: (opts) =>
        googleApiRequest('DELETE', `calendars/${encodeURIComponent(opts.calendarId)}/events/${encodeURIComponent(opts.eventId)}`, undefined, auth)
          .then(() => undefined),
      get: (opts) =>
        googleApiRequest('GET', `calendars/${encodeURIComponent(opts.calendarId)}/events/${encodeURIComponent(opts.eventId)}`, undefined, auth)
          .then((data) => ({ data: data as Record<string, unknown> })),
      patch: (opts) => {
        const qs = opts.conferenceDataVersion !== undefined ? `?conferenceDataVersion=${opts.conferenceDataVersion}` : '';
        return googleApiRequest('PATCH', `calendars/${encodeURIComponent(opts.calendarId)}/events/${encodeURIComponent(opts.eventId)}${qs}`, opts.requestBody, auth)
          .then((data) => ({ data: data as Record<string, unknown> }));
      },
      watch: (opts) =>
        googleApiRequest('POST', `calendars/${encodeURIComponent(opts.calendarId)}/events/watch`, opts.requestBody as Record<string, unknown>, auth)
          .then((data) => ({ data: { resourceId: (data as Record<string, unknown>).resourceId as string | undefined, expiration: (data as Record<string, unknown>).expiration as string | undefined } })),
    },
    channels: {
      stop: (opts) =>
        googleApiRequest('POST', 'channels/stop', opts.requestBody as Record<string, unknown>, auth)
          .then(() => undefined),
    },
    freebusy: {
      query: (opts) =>
        googleApiRequest('POST', 'freeBusy', opts.requestBody, auth)
          .then((data) => ({ data: data as { calendars: Record<string, { busy: Array<{ start: string; end: string }> }> } })),
    },
    calendarList: {
      list: () =>
        googleApiRequest('GET', 'users/me/calendarList', undefined, auth)
          .then((data) => ({ data: data as { items?: Array<{ id?: string; primary?: boolean }> } })),
    },
  };
}

let _calendar: CalendarClient | undefined;

export function getGoogleCalendar(): CalendarClient {
  if (!_calendar) {
    _calendar = buildCalendarClient();
  }
  return _calendar;
}

export function getDoctorCalendar(doctorId: string): CalendarClient | null {
  const client = getDoctorClient(doctorId);
  if (!client) return null;
  return buildCalendarClient(client);
}

export function createCalendarClient(auth: OAuth2Client): CalendarClient {
  return buildCalendarClient(auth);
}
