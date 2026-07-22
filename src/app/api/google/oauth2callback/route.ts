import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { exchangeDoctorCode, createDoctorClient, setDoctorClient } from '@/app/lib/google';
import { logAudit } from '@/app/lib/audit';
import { logger } from '@/app/lib/logger';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');

    if (error) {
      logger.warn('OAuth error', { error });
      return NextResponse.redirect(new URL('/dashboard/settings?error=oauth_denied', req.url));
    }

    if (!code || !state) {
      return NextResponse.redirect(new URL('/dashboard/settings?error=missing_params', req.url));
    }

    const redirectUri = Buffer.from(state, 'base64').toString('utf-8');
    const { tokens } = await exchangeDoctorCode(code, redirectUri);
    const doctorId = new URL(redirectUri).searchParams.get('doctorId') ?? '';

    if (!doctorId) {
      return NextResponse.redirect(new URL('/dashboard/settings?error=missing_doctor', req.url));
    }

    const expires = tokens.expiry_date ? new Date(tokens.expiry_date) : null;
    const refreshToken = tokens.refresh_token ?? undefined;

    await prisma.doctorCalendarToken.upsert({
      where: { doctorId },
      update: {
        accessToken: tokens.access_token ?? undefined,
        refreshToken,
        tokenExpiresAt: expires,
        scope: tokens.scope ?? undefined,
        connectedAt: new Date(),
        status: 'active',
        disconnectedAt: null,
      },
      create: {
        doctorId,
        accessToken: tokens.access_token ?? '',
        refreshToken,
        tokenExpiresAt: expires,
        scope: tokens.scope ?? undefined,
        connectedAt: new Date(),
        status: 'active',
      },
    });

    if (tokens.access_token && refreshToken) {
      const client = createDoctorClient(tokens.access_token, refreshToken, expires ?? undefined);
      setDoctorClient(doctorId, client);

      const { google: googleApi } = await import('@/app/lib/google');
      if (googleApi) {
        const res = await googleApi.calendarList.list({ auth: client });
        const primary = res.data.items?.find((c) => c.primary) ?? res.data.items?.[0];
        if (primary?.id) {
          await prisma.doctor.update({
            where: { id: doctorId },
            data: { calendarId: primary.id },
          }).catch(() => {});
        }
      }
    }

    logAudit('GOOGLE_OAUTH_CONNECTED', 'Doctor', doctorId, { expiresAt: expires?.toISOString() });
    logger.info('Doctor OAuth connected', { doctorId });

    return NextResponse.redirect(new URL('/dashboard/settings?oauth=success', req.url));
  } catch (err) {
    logger.error('OAuth callback error', { error: String(err) });
    return NextResponse.redirect(new URL('/dashboard/settings?error=oauth_failed', req.url));
  }
}
