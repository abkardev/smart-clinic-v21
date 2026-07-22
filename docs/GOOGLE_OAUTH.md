# Google Calendar OAuth

## Overview

SmartClinic supports two OAuth modes:
1. **Global OAuth**: Single shared Google Calendar account for all doctors (legacy)
2. **Per-Doctor OAuth**: Each doctor connects their own Google Calendar account

## OAuth Flow

### Per-Doctor Authentication Flow

```
Doctor clicks "Connect Calendar"
        │
        ▼
GET /api/doctors/connect-calendar?doctorId=xxx
        │
        ▼
Returns { url: "https://accounts.google.com/o/oauth2/auth?..." }
        │
        ▼
Doctor authorizes in Google OAuth consent screen
        │
        ▼
Google redirects to /api/google/oauth2callback?code=xxx&state=yyy
        │
        ▼
┌─────────────────────────────────┐
│  1. Exchange code for tokens     │
│  2. Store in DoctorCalendarToken │
│  3. Create OAuth2 client         │
│  4. Set in doctorClients Map     │
│  5. Fetch primary calendar ID    │
│  6. Update doctor.calendarId     │
│  7. Create watch channel         │
└─────────────────────────────────┘
        │
        ▼
Redirect to /dashboard/settings?oauth=success
```

### Disconnect Flow

```
Doctor clicks "Disconnect Calendar"
        │
        ▼
GET /api/doctors/connect-calendar?doctorId=xxx&disconnect=true
        │
        ▼
┌─────────────────────────────────┐
│  1. Revoke Google token         │
│  2. Mark token as 'revoked'     │
│  3. Remove from doctorClients   │
│  4. Stop watch channels         │
└─────────────────────────────────┘
```

## Token Storage

Tokens are stored in the `DoctorCalendarToken` model:

```prisma
model DoctorCalendarToken {
  id             String    @id @default(cuid())
  doctorId       String    @unique
  calendarId     String?
  accessToken    String?
  refreshToken   String?
  tokenExpiresAt DateTime?
  scope          String?
  connectedAt    DateTime?
  disconnectedAt DateTime?
  status         String    @default("active") // active | disconnected | revoked
}
```

## Token Lifecycle

```
Token Created (active)
    │
    ├── Token expiring (<5 min) → auto refresh → active
    │
    ├── Token expired → auto refresh on next use
    │       │
    │       ├── Refresh success → active (new expiration)
    │       │
    │       └── Refresh permanent failure (invalid_grant) → revoked
    │
    ├── Token revoked → user must reconnect
    │
    └── Manual disconnect → disconnected
```

### Token Refresh

Automatic refresh is handled by `oauthLifecycle.refreshDoctorToken()`:

1. Attempted when token expires or is within 5 minutes of expiration
2. Retries up to 3 times with exponential backoff (1s, 2s, 4s)
3. On permanent error (`invalid_grant`, `invalid_client`, `unauthorized_client`):
   - Marks token as `revoked`
   - Logs `GOOGLE_OAUTH_EXPIRED` audit event
   - Notifies admin via Sentry/logger
   - Doctor must reconnect manually
4. On success: updates `accessToken`, `tokenExpiresAt`, and OAuth2 client

## Graceful Degradation

When a doctor's OAuth token fails permanently:

1. The doctor is marked with `status: 'revoked'`
2. `getDoctorAuthClient()` returns `{ client: null, needsReconnect: true }`
3. Sync functions fall through gracefully — bookings are created locally but not synced to Google Calendar
4. Admin is notified of the permanent failure
5. Doctor sees a "Reconnect Calendar" prompt in settings

## Configuration

### Global OAuth (app-level)

```
GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxx
GOOGLE_REFRESH_TOKEN=1//xxx
GOOGLE_REDIRECT_URI=https://app.example.com/api/google/oauth2callback
```

### Per-Doctor OAuth (automatic)

Per-doctor tokens are stored in `DoctorCalendarToken` and managed automatically. No additional environment variables needed.

## OAuth Scopes

```
https://www.googleapis.com/auth/calendar
```

This scope allows:
- Reading calendar events
- Creating, updating, deleting events
- Watching for changes (push notifications)
- Reading free/busy information
- Creating Google Meet conferences

## Health Monitoring

The health endpoint reports:
- Active tokens count
- Expiring tokens count (<5 min)
- Expired tokens count
- Revoked tokens count

Thresholds:
- >3 expired tokens → degraded status
- Any revoked tokens → degraded status
