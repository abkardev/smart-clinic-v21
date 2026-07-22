import { NextRequest, NextResponse } from 'next/server';
import { getDoctorAuthUrl, exchangeDoctorCode, createDoctorClient, setDoctorClient } from '@/app/lib/google';
import { prisma } from '@/app/lib/prisma';
import { logAudit } from '@/app/lib/audit';
import { logger } from '@/app/lib/logger';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const code = searchParams.get('code');
    const doctorId = searchParams.get('doctorId');
    const disconnect = searchParams.get('disconnect');

    if (!doctorId) {
      return NextResponse.json({ error: 'doctorId required' }, { status: 400 });
    }

    const doctor = await prisma.doctor.findUnique({ where: { id: doctorId } });
    if (!doctor) {
      return NextResponse.json({ error: 'Doctor not found' }, { status: 404 });
    }

    if (disconnect === 'true') {
      const token = await prisma.doctorCalendarToken.findUnique({ where: { doctorId } });
      if (token) {
        await prisma.doctorCalendarToken.update({
          where: { doctorId },
          data: { status: 'disconnected', disconnectedAt: new Date() },
        });
        const { removeDoctorClient } = await import('@/app/lib/google');
        removeDoctorClient(doctorId);
        logAudit('GOOGLE_OAUTH_DISCONNECTED', 'Doctor', doctorId, {});
        logger.info('Doctor calendar disconnected', { doctorId });
      }
      return NextResponse.json({ success: true, connected: false });
    }

    if (!code) {
      const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/api/google/oauth2callback?doctorId=${doctorId}`;
      const url = getDoctorAuthUrl(redirectUri);
      return NextResponse.json({ url });
    }

    const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/api/google/oauth2callback?doctorId=${doctorId}`;
    const { tokens, client } = await exchangeDoctorCode(code, redirectUri);

    const expires = tokens.expiry_date ? new Date(tokens.expiry_date) : null;

    await prisma.doctorCalendarToken.upsert({
      where: { doctorId },
      update: {
        accessToken: tokens.access_token ?? undefined,
        refreshToken: tokens.refresh_token ?? undefined,
        tokenExpiresAt: expires,
        scope: tokens.scope ?? undefined,
        connectedAt: new Date(),
        status: 'active',
        disconnectedAt: null,
      },
      create: {
        doctorId,
        accessToken: tokens.access_token ?? '',
        refreshToken: tokens.refresh_token ?? '',
        tokenExpiresAt: expires,
        scope: tokens.scope ?? undefined,
        connectedAt: new Date(),
        status: 'active',
      },
    });

    setDoctorClient(doctorId, client);
    logAudit('GOOGLE_OAUTH_CONNECTED', 'Doctor', doctorId, { expiresAt: expires?.toISOString() });

    return NextResponse.json({ success: true, connected: true });
  } catch (err) {
    logger.error('Connect calendar error', { error: String(err) });
    return NextResponse.json({ error: 'Failed to connect' }, { status: 500 });
  }
}
