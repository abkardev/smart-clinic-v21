import { google } from './google';
import type { Booking, Doctor } from '@prisma/client';

interface CalendarResult {
  calendarEventId: string;
  calendarLink: string;
}

export async function createCalendarEvent(
  booking: Booking,
  doctor: Doctor
): Promise<CalendarResult | null> {
  try {
    const startDT = new Date(`${booking.date}T${booking.time}:00`);
    const endDT = new Date(startDT.getTime() + doctor.slotDuration * 60000);

    const event = await google.events.insert({
      calendarId: doctor.calendarId,
      requestBody: {
        summary: `${booking.name} — ${booking.service}`,
        description: `Phone: ${booking.phone}\nNotes: ${booking.notes ?? ''}`,
        start: { dateTime: startDT.toISOString(), timeZone: 'Asia/Riyadh' },
        end:   { dateTime: endDT.toISOString(), timeZone: 'Asia/Riyadh' },
      },
    });

    return {
      calendarEventId: event.data.id ?? '',
      calendarLink: event.data.htmlLink ?? '',
    };
  } catch (err) {
    console.error('Google Calendar createEvent failed:', (err as Error).message);
    return null;
  }
}

export async function updateCalendarEvent(
  booking: Booking,
  doctor: Doctor
): Promise<void> {
  if (!booking.calendarEventId) return;
  try {
    const startDT = new Date(`${booking.date}T${booking.time}:00`);
    const endDT = new Date(startDT.getTime() + doctor.slotDuration * 60000);

    await google.events.update({
      calendarId: doctor.calendarId,
      eventId: booking.calendarEventId,
      requestBody: {
        summary: `${booking.name} — ${booking.service}`,
        description: `Phone: ${booking.phone}\nNotes: ${booking.notes ?? ''}`,
        start: { dateTime: startDT.toISOString(), timeZone: 'Asia/Riyadh' },
        end:   { dateTime: endDT.toISOString(), timeZone: 'Asia/Riyadh' },
      },
    });
  } catch (err) {
    console.error('Google Calendar updateEvent failed:', (err as Error).message);
  }
}

export async function deleteCalendarEvent(
  calendarId: string,
  eventId: string
): Promise<void> {
  try {
    await google.events.delete({ calendarId, eventId });
  } catch (err) {
    console.error('Google Calendar deleteEvent failed:', (err as Error).message);
  }
}
