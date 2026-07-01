export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { apiResponse, toDbStatus } from '@/app/lib/apiResponse';
import { logAudit, auditOptsFromRequest } from '@/app/lib/audit';
import type { BookingStatus, BookingSource } from '@prisma/client';

const doctorSelect = {
  id: true, nameEn: true, nameAr: true, specialtyEn: true, specialtyAr: true,
};

interface BookingBody {
  name?: string; phone?: string; service?: string;
  date?: string; time?: string;
  status?: string; notes?: string; source?: string;
  reminderSent?: boolean;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const booking = await prisma.booking.findUnique({
      where: { id: params.id },
      include: { doctor: true },
    });
    if (!booking) return NextResponse.json({ message: 'Booking not found' }, { status: 404 });
    const { doctor, ...rest } = booking;
    return apiResponse({ ...rest, doctorId: doctor });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ message: 'Server error' }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await req.json() as BookingBody;
    const booking = await prisma.booking.update({
      where: { id: params.id },
      data: {
        ...(body.name        !== undefined && { name: body.name }),
        ...(body.phone       !== undefined && { phone: body.phone }),
        ...(body.service     !== undefined && { service: body.service }),
        ...(body.date        !== undefined && { date: body.date }),
        ...(body.time        !== undefined && { time: body.time }),
        ...(body.status      !== undefined && { status: toDbStatus(body.status) as BookingStatus }),
        ...(body.notes       !== undefined && { notes: body.notes }),
        ...(body.source      !== undefined && { source: body.source as BookingSource }),
        ...(body.reminderSent !== undefined && { reminderSent: body.reminderSent }),
      },
      include: { doctor: { select: doctorSelect } },
    });

    if (body.date || body.time) {
      try {
        const { updateCalendarEvent } = await import('@/app/lib/googleCalendar');
        const doctor = await prisma.doctor.findUnique({ where: { id: booking.doctorId } });
        if (doctor) await updateCalendarEvent(booking, doctor);
      } catch { /* non-fatal */ }
    }

    await logAudit('UPDATE_BOOKING', 'Booking', params.id,
      { updatedFields: Object.keys(body).filter(k => body[k as keyof BookingBody] !== undefined), status: booking.status },
      auditOptsFromRequest(req)
    );
    const { doctor, ...rest } = booking;
    return apiResponse({ ...rest, doctorId: doctor });
  } catch (err: unknown) {
    const e = err as { code?: string; message?: string };
    if (e.code === 'P2002') return NextResponse.json({ message: 'This time slot is already booked' }, { status: 409 });
    if (e.code === 'P2025') return NextResponse.json({ message: 'Booking not found' }, { status: 404 });
    return NextResponse.json({ message: e.message ?? 'Server error' }, { status: 400 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const booking = await prisma.booking.findUnique({
      where: { id: params.id },
      include: { doctor: true },
    });
    if (!booking) return NextResponse.json({ message: 'Booking not found' }, { status: 404 });

    if (booking.calendarEventId && booking.doctor?.calendarId) {
      try {
        const { deleteCalendarEvent } = await import('@/app/lib/googleCalendar');
        await deleteCalendarEvent(booking.doctor.calendarId, booking.calendarEventId);
      } catch { /* non-fatal */ }
    }

    await prisma.booking.delete({ where: { id: params.id } });
    await logAudit('DELETE_BOOKING', 'Booking', params.id,
      { name: booking.name, date: booking.date, time: booking.time },
      auditOptsFromRequest(req)
    );
    return NextResponse.json({ message: 'Booking deleted' });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ message: 'Server error' }, { status: 500 });
  }
}
