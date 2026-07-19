export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { getAuthUser, requireRole } from '@/app/lib/auth';
import { logAudit, auditOptsFromRequest, AuditAction } from '@/app/lib/audit';
import { logger } from '@/app/lib/logger';
import { sendAppointmentReminderEmail } from '@/app/lib/email';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { user, error } = await getAuthUser(req);
  if (error) return error;
  const roleError = requireRole(user!, 'superadmin', 'admin');
  if (roleError) return roleError;

  try {
    const booking = await prisma.booking.findUnique({
      where: { id: params.id },
      include: { doctor: true },
    });
    if (!booking) return NextResponse.json({ message: 'Booking not found' }, { status: 404 });

    const body = await req.json().catch(() => ({}));
    const email: string | undefined = body.email;
    if (!email) {
      return NextResponse.json({ message: 'Email is required' }, { status: 400 });
    }

    const doctorName = user!.preferredLang === 'ar'
      ? (booking.doctor?.nameAr || booking.doctor?.nameEn || 'Doctor')
      : (booking.doctor?.nameEn || booking.doctor?.nameAr || 'Doctor');

    await sendAppointmentReminderEmail(
      email,
      booking.name,
      doctorName,
      booking.date,
      booking.time,
      booking.service,
      user!.preferredLang || 'en',
    );

    await prisma.booking.update({
      where: { id: params.id },
      data: { reminderSent: true, reminderSentAt: new Date() },
    });

    await logAudit(
      AuditAction.REMINDER_SENT,
      'Booking',
      params.id,
      { type: 'email', email, patientName: booking.name },
      auditOptsFromRequest(req, user!),
    );

    return NextResponse.json({ message: 'Email reminder sent successfully' });
  } catch (err) {
    logger.error('Failed to send email reminder', { error: String(err), bookingId: params.id });
    return NextResponse.json({ message: 'Server error' }, { status: 500 });
  }
}
