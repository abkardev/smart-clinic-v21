import { prisma } from './prisma';
import { logger } from './logger';
import { logAudit } from './audit';
import { createDoctorClient, setDoctorClient, removeDoctorClient, getDoctorCalendar } from './google';
import type { OAuth2Client } from 'google-auth-library';

const TOKEN_REFRESH_LEAD_TIME_MS = 5 * 60 * 1000;
const MAX_REFRESH_RETRIES = 3;

interface OAuthStatus {
  doctorId: string;
  connected: boolean;
  expiresAt: Date | null;
  expired: boolean;
  refreshTokenExists: boolean;
  status: string;
}

export async function getDoctorOAuthStatus(doctorId: string): Promise<OAuthStatus | null> {
  const token = await prisma.doctorCalendarToken.findUnique({ where: { doctorId } });
  if (!token) return null;

  return {
    doctorId,
    connected: token.status === 'active',
    expiresAt: token.tokenExpiresAt,
    expired: token.tokenExpiresAt ? token.tokenExpiresAt <= new Date() : false,
    refreshTokenExists: !!token.refreshToken,
    status: token.status,
  };
}

export async function getDoctorAuthClient(doctorId: string): Promise<{ client: OAuth2Client | null; needsReconnect: boolean }> {
  const existing = getDoctorCalendar(doctorId);
  if (existing) {
    return { client: (existing as unknown as { auth: OAuth2Client }).auth, needsReconnect: false };
  }

  const token = await prisma.doctorCalendarToken.findUnique({ where: { doctorId } });
  if (!token || token.status !== 'active') {
    return { client: null, needsReconnect: token?.status === 'revoked' };
  }

  if (!token.accessToken || !token.refreshToken) {
    return { client: null, needsReconnect: true };
  }

  const tokenExpired = token.tokenExpiresAt && token.tokenExpiresAt <= new Date();
  if (tokenExpired) {
    try {
      const refreshed = await refreshDoctorToken(doctorId);
      if (!refreshed) {
        return { client: null, needsReconnect: true };
      }
    } catch (err) {
      logger.error('Failed to refresh doctor token', { doctorId, error: String(err) });
      return { client: null, needsReconnect: true };
    }
  }

  const client = createDoctorClient(token.accessToken, token.refreshToken, token.tokenExpiresAt ?? undefined);
  setDoctorClient(doctorId, client);
  return { client, needsReconnect: false };
}

export async function refreshDoctorToken(doctorId: string): Promise<boolean> {
  const token = await prisma.doctorCalendarToken.findUnique({ where: { doctorId } });
  if (!token || !token.refreshToken) return false;

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_REFRESH_RETRIES; attempt++) {
    try {
      const client = createDoctorClient(token.accessToken ?? '', token.refreshToken);
      const { credentials } = await client.refreshAccessToken();

      if (!credentials.access_token) {
        throw new Error('No access token returned from refresh');
      }

      const expiresAt = credentials.expiry_date ? new Date(credentials.expiry_date) : null;

      await prisma.doctorCalendarToken.update({
        where: { doctorId },
        data: {
          accessToken: credentials.access_token,
          tokenExpiresAt: expiresAt,
          status: 'active',
        },
      });

      setDoctorClient(doctorId, client);

      logAudit('GOOGLE_OAUTH_REFRESHED', 'Doctor', doctorId, { expiresAt: expiresAt?.toISOString() });
      logger.info('Doctor OAuth token refreshed', { doctorId });
      return true;
    } catch (err) {
      lastError = err as Error;
      const gErr = err as { code?: number; response?: { data?: { error?: string } } };
      const googleError = gErr.response?.data?.error ?? '';
      const isPermanent = googleError === 'invalid_grant' || googleError === 'invalid_client' || googleError === 'unauthorized_client';

      if (isPermanent) {
        await prisma.doctorCalendarToken.update({
          where: { doctorId },
          data: { status: 'revoked' },
        });

        removeDoctorClient(doctorId);
        logAudit('GOOGLE_OAUTH_EXPIRED', 'Doctor', doctorId, {
          error: googleError || 'Permanent token failure',
          permanent: true,
        });
        logger.error('Doctor OAuth token permanently failed', { doctorId, error: googleError });

        await notifyAdmin(doctorId, googleError || 'Token revoked');
        return false;
      }

      logger.warn('Token refresh attempt failed', {
        doctorId,
        attempt,
        maxRetries: MAX_REFRESH_RETRIES,
        error: String(err),
      });

      if (attempt < MAX_REFRESH_RETRIES) {
        await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt)));
      }
    }
  }

  logAudit('GOOGLE_OAUTH_EXPIRED', 'Doctor', doctorId, {
    error: lastError?.message ?? 'Max refresh retries exceeded',
    permanent: false,
  });

  await notifyAdmin(doctorId, `Token refresh failed after ${MAX_REFRESH_RETRIES} attempts`);
  return false;
}

export async function revokeDoctorToken(doctorId: string): Promise<void> {
  const token = await prisma.doctorCalendarToken.findUnique({ where: { doctorId } });
  if (!token) return;

  try {
    const client = createDoctorClient(token.accessToken ?? '', token.refreshToken ?? '');
    await client.revokeToken(token.refreshToken ?? token.accessToken ?? '');
  } catch (err) {
    logger.warn('Token revocation API call failed (may already be revoked)', {
      doctorId,
      error: String(err),
    });
  }

  await prisma.doctorCalendarToken.update({
    where: { doctorId },
    data: {
      status: 'revoked',
      disconnectedAt: new Date(),
      accessToken: null,
      refreshToken: null,
    },
  });

  removeDoctorClient(doctorId);
  logAudit('GOOGLE_OAUTH_DISCONNECTED', 'Doctor', doctorId, { type: 'revocation' });
  logger.info('Doctor OAuth token revoked', { doctorId });
}

export async function refreshAllExpiringTokens(): Promise<{
  refreshed: number;
  failed: number;
  revoked: number;
}> {
  const expiringSoon = await prisma.doctorCalendarToken.findMany({
    where: {
      status: 'active',
      tokenExpiresAt: {
        lt: new Date(Date.now() + TOKEN_REFRESH_LEAD_TIME_MS),
        gt: new Date(),
      },
    },
  });

  let refreshed = 0;
  let failed = 0;
  let revoked = 0;

  for (const token of expiringSoon) {
    const success = await refreshDoctorToken(token.doctorId);
    if (success) {
      refreshed++;
    } else {
      const current = await prisma.doctorCalendarToken.findUnique({ where: { doctorId: token.doctorId } });
      if (current?.status === 'revoked') {
        revoked++;
      } else {
        failed++;
      }
    }
  }

  const expired = await prisma.doctorCalendarToken.findMany({
    where: {
      status: 'active',
      tokenExpiresAt: { lte: new Date() },
    },
  });

  for (const token of expired) {
    const success = await refreshDoctorToken(token.doctorId);
    if (success) {
      refreshed++;
    } else {
      const current = await prisma.doctorCalendarToken.findUnique({ where: { doctorId: token.doctorId } });
      if (current?.status === 'revoked') {
        revoked++;
      } else {
        failed++;
      }
    }
  }

  if (refreshed > 0 || failed > 0 || revoked > 0) {
    logger.info('Token refresh cycle completed', { refreshed, failed, revoked });
  }

  return { refreshed, failed, revoked };
}

export async function getTokenHealth() {
  const now = new Date();
  const [active, expiring, expired, revoked, total] = await Promise.all([
    prisma.doctorCalendarToken.count({ where: { status: 'active', tokenExpiresAt: { gt: now } } }),
    prisma.doctorCalendarToken.count({ where: { status: 'active', tokenExpiresAt: { lt: new Date(now.getTime() + TOKEN_REFRESH_LEAD_TIME_MS), gt: now } } }),
    prisma.doctorCalendarToken.count({ where: { status: 'active', tokenExpiresAt: { lte: now } } }),
    prisma.doctorCalendarToken.count({ where: { status: 'revoked' } }),
    prisma.doctorCalendarToken.count(),
  ]);

  return { active, expiring, expired, revoked, total };
}

async function notifyAdmin(doctorId: string, error: string): Promise<void> {
  logger.error('OAuth ADMIN ALERT: Doctor calendar needs attention', { doctorId, error });
}
