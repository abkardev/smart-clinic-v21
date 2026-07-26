export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { getAuthUser } from '@/app/lib/auth';
import { logger } from '@/app/lib/logger';
import { MSG } from '@/app/lib/botMessages';
import { required } from '@/app/lib/env';

function getWhatsAppToken(): string {
  return required('WHATSAPP_TOKEN');
}

function getWhatsAppPhoneId(): string {
  return required('WHATSAPP_PHONE_ID');
}

const WA_URL = () => `https://graph.facebook.com/v18.0/${getWhatsAppPhoneId()}/messages`;
const WA_HEADERS = () => ({
  Authorization: `Bearer ${getWhatsAppToken()}`,
  'Content-Type': 'application/json',
});

// POST /api/whatsapp/reminder/[id]
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await getAuthUser(req);
  if (error) return error;

  const { id } = await params;

  try {
    const booking = await prisma.booking.findUnique({
      where: { id },
      include: { doctor: true },
    });
    if (!booking) return NextResponse.json({ message: 'Booking not found' }, { status: 404 });

    const text = MSG.reminder(
      booking.name,
      booking.doctor?.nameAr || 'الطبيب',
      booking.doctor?.nameEn || 'Doctor',
      booking.service,
      booking.service,
      booking.date,
      booking.time
    );

    const res = await fetch(WA_URL(), {
      method: 'POST',
      headers: WA_HEADERS(),
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: booking.phone,
        type: 'text',
        text: { body: text },
      }),
    });

    if (!res.ok) {
      const err = await res.json();
      logger.error('WA reminder error', { error: JSON.stringify(err) });
      return NextResponse.json({ message: 'Failed to send reminder', detail: err }, { status: 502 });
    }

    await prisma.booking.update({
      where: { id },
      data: { reminderSent: true, reminderSentAt: new Date() },
    });

    return NextResponse.json({ message: 'Reminder sent successfully' });
  } catch (err) {
    logger.error('Failed to send reminder', { error: String(err), bookingId: id });
    return NextResponse.json({ message: 'Server error' }, { status: 500 });
  }
}
