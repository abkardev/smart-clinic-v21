import { google as googleApis } from 'googleapis';

const auth = new googleApis.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

auth.setCredentials({
  refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
});

export const google = googleApis.calendar({ version: 'v3', auth });

// ─── Google OAuth helpers ─────────────────────────────────────────────────────
export function getAuthUrl(): string {
  return auth.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/calendar'],
    prompt: 'consent',
  });
}

export async function exchangeCode(code: string) {
  const { tokens } = await auth.getToken(code);
  return tokens;
}
