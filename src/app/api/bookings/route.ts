export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { getAvailableSlots } from '@/app/lib/availability';
import type { BookingStatus, BookingSource } from '@prisma/client';
import { apiResponse, toDbStatus } from '@/app/lib/apiResponse';
import { logAudit, auditOptsFromRequest } from '@/app/lib/audit';

const doctorSelect = {
  id: true, nameEn: true, nameAr: true, specialtyEn: true, specialtyAr: true,
};

// GET /api/bookings
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const doctorId  = searchParams.get('doctorId');
    const date      = searchParams.get('date');
    const status    = searchParams.get('status');
    const startDate = searchParams.get('startDate');
    const endDate   = searchParams.get('endDate');

    const where: Record<string, unknown> = {};
    if (doctorId) where.doctorId = doctorId;
    if (status)   where.status = status;
    if (date) {
      where.date = date;
    } else if (startDate || endDate) {
      const dateFilter: Record<string, string> = {};
      if (startDate) dateFilter.gte = startDate;
      if (endDate)   dateFilter.lte = endDate;
      where.date = dateFilter;
    }

    const bookings = await prisma.booking.findMany({
      where,
      include: { doctor: { select: doctorSelect } },
      orderBy: [{ date: 'asc' }, { time: 'asc' }],
    });

    // Shape response to match original API (doctorId field holds populated doc)
    const shaped = bookings.map(({ doctor, ...b }) => ({ ...b, doctorId: doctor }));
    return apiResponse(shaped);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ message: 'Server error' }, { status: 500 });
  }
}

// POST /api/bookings
export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      doctorId: string; date: string; time: string;
      name: string; phone: string; service: string;
      status?: string; notes?: string; source?: string;
    };
    const { doctorId, date, time } = body;

    const doctor = await prisma.doctor.findUnique({ where: { id: doctorId } });
    if (!doctor) return NextResponse.json({ message: 'Doctor not found' }, { status: 404 });

    const { available } = await getAvailableSlots(doctor, date);
    if (!available.includes(time)) {
      return NextResponse.json({ message: 'This time slot is not available', available }, { status: 409 });
    }

    const booking = await prisma.booking.create({
      data: {
        name: body.name,
        phone: body.phone,
        service: body.service,
        date,
        time,
        status: (toDbStatus(body.status) ?? 'pending') as BookingStatus,
        notes: body.notes ?? null,
        doctorId,
        source: (body.source ?? 'dashboard') as BookingSource,
      },
      include: { doctor: { select: doctorSelect } },
    });

    // Attempt Google Calendar sync
    try {
      const { createCalendarEvent } = await import('@/app/lib/googleCalendar');
      const calResult = await createCalendarEvent(booking, doctor);
      if (calResult) {
        await prisma.booking.update({
          where: { id: booking.id },
          data: { ...calResult, calendarSynced: true },
        });
      }
    } catch { /* calendar sync is non-fatal */ }

    const { doctor: doc, ...rest } = booking;
    // Log after calendar sync
    await logAudit('CREATE_BOOKING', 'Booking', booking.id,
      { name: booking.name, phone: booking.phone, date: booking.date, time: booking.time, doctorId: booking.doctorId, source: booking.source },
      auditOptsFromRequest(req)
    );
    return apiResponse({ ...rest, doctorId: doc }, { status: 201 });
  } catch (err: unknown) {
    const e = err as { code?: string; message?: string };
    if (e.code === 'P2002') {
      return NextResponse.json({ message: 'This time slot is already booked' }, { status: 409 });
    }
    return NextResponse.json({ message: e.message ?? 'Server error' }, { status: 400 });
  }
}
