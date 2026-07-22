import { google } from './google';
import { logger } from './logger';
import { logAudit } from './audit';

export interface ConferenceData {
  createRequest: {
    conferenceSolutionKey: { type: 'hangoutsMeet' };
    requestId: string;
  };
}

export function createConferenceData(bookingId: string): ConferenceData {
  return {
    createRequest: {
      conferenceSolutionKey: { type: 'hangoutsMeet' },
      requestId: `booking-${bookingId}-${Date.now()}`,
    },
  };
}

export function getMeetLink(event: Record<string, unknown>): string | null {
  const hangoutLink = event.hangoutLink as string | undefined;
  if (hangoutLink) return hangoutLink;

  const conferenceData = event.conferenceData as Record<string, unknown> | undefined;
  if (conferenceData?.entryPoints && Array.isArray(conferenceData.entryPoints)) {
    const videoEntry = conferenceData.entryPoints.find(
      (ep: Record<string, unknown>) => ep.entryPointType === 'video',
    );
    if (videoEntry?.uri) return videoEntry.uri as string;
  }

  return null;
}

export async function addMeetToEvent(
  calendarId: string,
  eventId: string,
  bookingId: string,
): Promise<string | null> {
  try {
    const patchRes = await google.events.patch({
      calendarId,
      eventId,
      requestBody: {
        conferenceData: createConferenceData(bookingId),
      },
      conferenceDataVersion: 1,
    });

    const meetLink = getMeetLink(patchRes.data as unknown as Record<string, unknown>);
    if (meetLink) {
      logAudit('GOOGLE_MEET_CREATED', 'Booking', bookingId, { calendarId, eventId, meetLink });
      logger.info('Meet link added to event', { bookingId, meetLink });
    }
    return meetLink;
  } catch (err) {
    logger.error('Failed to add Meet to event', { bookingId, eventId, error: String(err) });
    return null;
  }
}
