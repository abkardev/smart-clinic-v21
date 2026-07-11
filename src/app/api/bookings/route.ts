export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { getAvailableSlots } from '@/app/lib/availability';
import type { BookingStatus, BookingSource } from '@prisma/client';
import { apiResponse, toDbStatus } from '@/app/lib/apiResponse';
import { logAudit, auditOptsFromRequest, AuditAction } from '@/app/lib/audit';
import { metrics } from '@/app/lib/metrics';

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
    const legacy    = searchParams.get('legacy') === 'true';
    let page        = parseInt(searchParams.get('page') ?? '1', 10);
    let pageSize    = parseInt(searchParams.get('pageSize') ?? '50', 10);

    if (page < 1) page = 1;
    if (pageSize < 1) pageSize = 50;
    if (pageSize > 200) pageSize = 200;

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

    if (legacy) {
      const bookings = await prisma.booking.findMany({
        where,
        include: { doctor: { select: doctorSelect } },
        orderBy: [{ date: 'asc' }, { time: 'asc' }],
      });
      const shaped = bookings.map(({ doctor, ...b }) => ({ ...b, doctorId: doctor }));
      return apiResponse(shaped);
    }

    const skip = (page - 1) * pageSize;

    const [bookings, total] = await Promise.all([
      prisma.booking.findMany({
        where,
        include: { doctor: { select: doctorSelect } },
        orderBy: [{ date: 'asc' }, { time: 'asc' }],
        skip,
        take: pageSize,
      }),
      prisma.booking.count({ where }),
    ]);

    const shaped = bookings.map(({ doctor, ...b }) => ({ ...b, doctorId: doctor }));
    return NextResponse.json({
      data: shaped,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ message: 'Server error' }, { status: 500 });
  }
}

// POST /api/bookings
export async function POST(req: NextRequest) {
  const reqStart = Date.now();
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
    metrics.bookingsCreated.inc();
    metrics.bookingCreationLatency.observe(Date.now() - reqStart);
    // Log after calendar sync
    await logAudit(AuditAction.BOOKING_CREATED, 'Booking', booking.id,
      { name: booking.name, phone: booking.phone, date: booking.date, time: booking.time, doctorId: booking.doctorId, source: booking.source },
      auditOptsFromRequest(req)
    );
    return apiResponse({ ...rest, doctorId: doc }, { status: 201 });
  } catch (err: unknown) {
    metrics.bookingsFailed.inc();
    const e = err as { code?: string; message?: string };
    if (e.code === 'P2002') {
      return NextResponse.json({ message: 'This time slot is already booked' }, { status: 409 });
    }
    return NextResponse.json({ message: e.message ?? 'Server error' }, { status: 400 });
  }
}
