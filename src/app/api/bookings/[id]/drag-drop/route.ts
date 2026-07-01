export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { apiResponse, toDbStatus } from '@/app/lib/apiResponse';
import { logAudit, auditOptsFromRequest } from '@/app/lib/audit';
import { getAvailableSlots } from '@/app/lib/availability';

// PATCH /api/bookings/[id]/drag-drop
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { date, time } = await req.json() as { date: string; time: string };

    const booking = await prisma.booking.findUnique({
      where: { id: params.id },
      include: { doctor: true },
    });
    if (!booking) return NextResponse.json({ message: 'Booking not found' }, { status: 404 });

    const { available } = await getAvailableSlots(booking.doctor, date);
    if (!available.includes(time)) {
      return NextResponse.json({ message: 'Target slot is not available' }, { status: 409 });
    }

    const updated = await prisma.booking.update({
      where: { id: params.id },
      data: { date, time },
    });

    try {
      const { updateCalendarEvent } = await import('@/app/lib/googleCalendar');
      await updateCalendarEvent(updated, booking.doctor);
    } catch { /* non-fatal */ }

    await logAudit('DRAG_DROP_BOOKING', 'Booking', params.id,
      { oldDate: booking.date, oldTime: booking.time, newDate: date, newTime: time },
      auditOptsFromRequest(req)
    );
    return apiResponse(updated);
  } catch (err: unknown) {
    const e = err as { code?: string; message?: string };
    if (e.code === 'P2002') return NextResponse.json({ message: 'This time slot is already booked' }, { status: 409 });
    return NextResponse.json({ message: e.message ?? 'Server error' }, { status: 400 });
  }
}
