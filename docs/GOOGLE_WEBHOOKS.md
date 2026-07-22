# Google Calendar Webhooks

## Overview

Google Calendar push notifications (webhooks) allow real-time synchronization when calendar events change. The webhook system uses the Google Calendar Channels API to register notification endpoints.

## Channel Setup

### Creating a Watch Channel

```typescript
const WEBHOOK_URL = `${NEXT_PUBLIC_APP_URL}/api/google/webhook`;

// Channel TTL: 7 days (604,800 seconds)
const expiration = Date.now() + 604800 * 1000;

const res = await google.events.watch({
  calendarId: doctor.calendarId,
  requestBody: {
    id: `smartclinic-${doctor.id}-${Date.now()}`,
    type: 'web_hook',
    address: WEBHOOK_URL,
    expiration: String(expiration),
    token: doctor.id, // channel token = doctor ID for verification
  },
});
```

### Channel Renewal

Channels expire every 7 days. The renewal process:
1. Cron job runs `POST /api/cron/renew-channels`
2. Finds channels expiring within 24 hours
3. Stops old channel via `channels.stop()` API
4. Creates new channel via `events.watch()` API
5. Retries up to 3 times on failure
6. Marks channel as `error` if all retries fail

### Duplicate Prevention

`channelScheduler.deduplicateChannels()` ensures at most one active channel per doctor/calendar pair. If duplicates found, only the most recently created channel is kept active.

## Webhook Payload

Google sends POST requests to the webhook endpoint with specific headers:

| Header | Description | Example |
|--------|-------------|---------|
| `X-Goog-Channel-ID` | Unique channel identifier | `smartclinic-dr123-1700000000000` |
| `X-Goog-Resource-ID` | Unique resource identifier | `abc123def456` |
| `X-Goog-Resource-State` | State of the resource | `sync` or `exists` |
| `X-Goog-Channel-Token` | Opaque token set during watch | Doctor ID |
| `X-Goog-Message-Number` | Monotonically increasing message number | `1` |
| `X-Goog-Channel-Expiration` | ISO date of channel expiration | `2026-07-29T12:00:00.000Z` |

### Resource States

| State | Meaning | Action |
|-------|---------|--------|
| `sync` | Initial sync notification | Acknowledge (200), no processing |
| `exists` | Resource has changed | Perform incremental sync |

## Webhook Verification Flow

```
Receive POST /api/google/webhook
        │
        ▼
┌─────────────────────────────┐
│ Extract Headers:             │
│ - X-Goog-Channel-ID         │
│ - X-Goog-Resource-ID        │
│ - X-Goog-Resource-State     │
│ - X-Goog-Channel-Token      │
│ - X-Goog-Message-Number     │
└─────────────────────────────┘
        │
        ▼
┌─────────────────────────────┐
│ Validate Required Headers:  │
│ - Channel ID present?       │
│ - Resource ID present?      │
│ - Resource State present?   │
└─────────────────────────────┘
        │
        ▼
┌─────────────────────────────┐
│ Verify Channel Exists:      │
│ - Check CalendarChannel     │
│ - Verify resourceId matches │
│ - Check channel is active   │
└─────────────────────────────┘
        │
        ▼
┌─────────────────────────────┐
│ Verify Channel Token:       │
│ - Token matches doctorId    │
└─────────────────────────────┘
        │
        ▼
┌─────────────────────────────┐
│ Check Expiration:           │
│ - Channel not expired       │
└─────────────────────────────┘
        │
        ▼
┌─────────────────────────────┐
│ Replay Protection:          │
│ - Check ProcessedNotification
│ - Check in-memory cache    │
│ - Mark notification as      │
│   processed                 │
└─────────────────────────────┘
        │
        ▼
┌─────────────────────────────┐
│ Process (if resourceState   │
│ is 'exists'):               │
│ - Incremental sync          │
│ - Update bookings           │
│ - Import busy times         │
│ - Update syncToken          │
└─────────────────────────────┘
```

## Security Considerations

### Replay Attack Prevention
- Each notification is identified by `channelId::resourceId::messageNumber`
- Notifications are stored in `ProcessedNotification` table with 24-hour TTL
- In-memory cache also prevents duplicates within the same process
- Message numbers > 1 help detect replays (Google sends messageNumber=1 for first notification)

### Channel Token Verification
- The `X-Goog-Channel-Token` header is set to the doctor ID during channel creation
- If the token is present and doesn't match the channel's doctor, the request is rejected with 403

### Expiration Check
- If the channel's `expiration` timestamp is in the past, the request is accepted but processing is skipped
- This prevents processing notifications for expired channels

## Error Handling

| Status Code | Condition | Action |
|-------------|-----------|--------|
| 200 | Success or duplicate | Acknowledge |
| 400 | Missing required headers | Reject |
| 403 | Channel token mismatch | Reject |
| 404 | Channel not found in DB | Reject |
| 500 | Internal server error | Return 500 |

## Monitoring

- **Metrics**: `google_calendar_notifications` counter incremented for each valid webhook
- **Audit**: `GOOGLE_WEBHOOK_RECEIVED` and `GOOGLE_WEBHOOK_PROCESSED` events logged
- **Health**: Channel count, expiring channels, and errored channels reported in health check
