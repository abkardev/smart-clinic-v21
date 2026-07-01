export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { getAuthUser, requireRole } from '@/app/lib/auth';
import { logAudit, auditOptsFromRequest } from '@/app/lib/audit';

// GET /api/blocked-slots
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const doctorId  = searchParams.get('doctorId');
    const date      = searchParams.get('date');
    const startDate = searchParams.get('startDate');
    const endDate   = searchParams.get('endDate');

    const where: Record<string, unknown> = {};
    if (doctorId) where.doctorId = doctorId;
    if (date) {
      where.date = date;
    } else if (startDate || endDate) {
      const dateFilter: Record<string, string> = {};
      if (startDate) dateFilter.gte = startDate;
      if (endDate)   dateFilter.lte = endDate;
      where.date = dateFilter;
    }

    const slots = await prisma.blockedSlot.findMany({
      where,
      include: { blockedBy: { select: { name: true } } },
      orderBy: [{ date: 'asc' }, { time: 'asc' }],
    });

    return NextResponse.json(slots);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ message: 'Server error' }, { status: 500 });
  }
}

// POST /api/blocked-slots
export async function POST(req: NextRequest) {
  const { user, error } = await getAuthUser(req);
  if (error) return error;
  const roleError = requireRole(user!, 'superadmin', 'admin', 'doctor');
  if (roleError) return roleError;

  try {
    const { doctorId, date, time, reason, isWholeDay } = await req.json() as { doctorId: string; date: string; time?: string; reason?: string; isWholeDay?: boolean };

    const doctor = await prisma.doctor.findUnique({ where: { id: doctorId } });
    if (!doctor) return NextResponse.json({ message: 'Doctor not found' }, { status: 404 });

    // Doctors can only block their own slots
    if (user!.role === 'doctor' && user!.doctorId !== doctorId) {
      return NextResponse.json({ message: 'Can only block your own slots' }, { status: 403 });
    }

    const slot = await prisma.blockedSlot.create({
      data: {
        doctorId,
        date,
        time: isWholeDay ? null : time,
        reason: reason ?? '',
        isWholeDay: !!isWholeDay,
        blockedById: user!.id,
      },
    });

    // Optionally sync to Google Calendar
    try {
      const { google } = await import('@/app/lib/google');
      const startDT = new Date(`${date}T${isWholeDay ? '00:00' : time}:00`);
      const endDT = isWholeDay
        ? new Date(`${date}T23:59:59`)
        : new Date(startDT.getTime() + 30 * 60000);

      const event = await google.events.insert({
        calendarId: doctor.calendarId,
        requestBody: {
          summary: `🚫 ${reason || 'Unavailable'}`,
          start: { dateTime: startDT.toISOString(), timeZone: 'Asia/Riyadh' },
          end:   { dateTime: endDT.toISOString(), timeZone: 'Asia/Riyadh' },
          transparency: 'opaque',
        },
      });

      await prisma.blockedSlot.update({
        where: { id: slot.id },
        data: { syncedToGoogle: true, googleEventId: event.data.id ?? null },
      });
    } catch (gErr) {
      console.error('Google Calendar block sync failed:', (gErr as Error).message);
    }

    await logAudit('BLOCK_SLOT', 'BlockedSlot', slot.id, { doctorId, date, time, reason }, auditOptsFromRequest(req, user!));
    return NextResponse.json(slot, { status: 201 });
  } catch (err: unknown) {
    const e = err as { code?: string; message?: string };
    if (e.code === 'P2002') return NextResponse.json({ message: 'Slot already blocked' }, { status: 409 });
    return NextResponse.json({ message: e.message ?? 'Server error' }, { status: 400 });
  }
}
