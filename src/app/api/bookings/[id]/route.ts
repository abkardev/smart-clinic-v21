export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { getAuthUser, requireRole } from '@/app/lib/auth';
import { apiResponse, toDbStatus } from '@/app/lib/apiResponse';
import { logAudit, auditOptsFromRequest, AuditAction } from '@/app/lib/audit';
import { logger } from '@/app/lib/logger';
import type { BookingSource } from '@prisma/client';

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
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { error } = await getAuthUser(req);
    if (error) return error;

    const booking = await prisma.booking.findUnique({
      where: { id: params.id },
      include: { doctor: true },
    });
    if (!booking) return NextResponse.json({ message: 'Booking not found' }, { status: 404 });
    const { doctor, ...rest } = booking;
    return apiResponse({ ...rest, doctorId: doctor });
  } catch (err) {
    logger.error('Failed to fetch booking', { error: String(err), bookingId: params.id });
    return NextResponse.json({ message: 'Server error' }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { user, error } = await getAuthUser(req);
    if (error) return error;
    const roleError = requireRole(user!, 'superadmin', 'admin');
    if (roleError) return roleError;

    const body = await req.json() as BookingBody;
    const before = await prisma.booking.findUnique({ where: { id: params.id } });
    const booking = await prisma.booking.update({
      where: { id: params.id },
      data: {
        ...(body.name        !== undefined && { name: body.name }),
        ...(body.phone       !== undefined && { phone: body.phone }),
        ...(body.service     !== undefined && { service: body.service }),
        ...(body.date        !== undefined && { date: body.date }),
        ...(body.time        !== undefined && { time: body.time }),
        ...(body.status      !== undefined && { status: toDbStatus(body.status) }),
        ...(body.notes       !== undefined && { notes: body.notes }),
        ...(body.source      !== undefined && { source: body.source as BookingSource }),
        ...(body.reminderSent !== undefined && { reminderSent: body.reminderSent }),
      },
      include: { doctor: { select: doctorSelect } },
    });

    if (body.date || body.time || body.status) {
      try {
        const { syncBooking } = await import('@/app/lib/googleCalendar');
        const doctor = await prisma.doctor.findUnique({ where: { id: booking.doctorId } });
        if (doctor) await syncBooking(booking, doctor, { auditOpts: auditOptsFromRequest(req, user!) });
      } catch (err) { logger.warn('Failed to sync calendar event', { error: String(err), bookingId: params.id }); }
    }

    const changes: Record<string, { before: unknown; after: unknown }> = {};
    if (before) {
      for (const key of ['name', 'phone', 'service', 'date', 'time', 'status', 'notes', 'source'] as const) {
        if (body[key as keyof BookingBody] !== undefined && booking[key] !== before[key as keyof typeof before]) {
          changes[key] = { before: before[key as keyof typeof before], after: booking[key] };
        }
      }
    }

    await logAudit(AuditAction.BOOKING_UPDATED, 'Booking', params.id,
      { changes, status: booking.status },
      auditOptsFromRequest(req, user!)
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
    const { user, error } = await getAuthUser(req);
    if (error) return error;
    const roleError = requireRole(user!, 'superadmin', 'admin');
    if (roleError) return roleError;

    const booking = await prisma.booking.findUnique({
      where: { id: params.id },
      include: { doctor: true },
    });
    if (!booking) return NextResponse.json({ message: 'Booking not found' }, { status: 404 });

    await prisma.booking.delete({ where: { id: params.id } });

    if (booking.calendarEventId && booking.doctor?.calendarId) {
      try {
        const { deleteCalendarEvent } = await import('@/app/lib/googleCalendar');
        await deleteCalendarEvent(booking.doctor.calendarId, booking.calendarEventId);
      } catch (err) { logger.warn('Failed to delete calendar event', { error: String(err), bookingId: params.id }); }
    }
    await logAudit(AuditAction.BOOKING_DELETED, 'Booking', params.id,
      { name: booking.name, date: booking.date, time: booking.time },
      auditOptsFromRequest(req, user!)
    );
    return NextResponse.json({ message: 'Booking deleted' });
  } catch (err) {
    logger.error('Failed to delete booking', { error: String(err), bookingId: params.id });
    return NextResponse.json({ message: 'Server error' }, { status: 500 });
  }
}
