# Google Calendar Architecture

## Overview

The SmartClinic Google Calendar integration provides bi-directional synchronization between clinic bookings and Google Calendar events. It supports push notifications, per-doctor OAuth, recurring events, Google Meet integration, and automated conflict detection.

## System Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                      SmartClinic App                          │
│                                                               │
│  ┌─────────┐  ┌──────────┐  ┌────────────┐  ┌─────────────┐ │
│  │ OAuth   │  │ Sync     │  │ Channels   │  │ Quota       │ │
│  │ Layer   │──│ Engine   │──│ Module    │──│ Manager    │ │
│  └─────────┘  └──────────┘  └────────────┘  └─────────────┘ │
│       │             │              │               │          │
│  ┌─────────┐  ┌──────────┐  ┌────────────┐  ┌─────────────┐ │
│  │ Token   │  │ Conflict │  │ Webhook    │  │ Metrics     │ │
│  │ Store   │  │ Detector │  │ Receiver   │  │ Collector   │ │
│  └─────────┘  └──────────┘  └────────────┘  └─────────────┘ │
│                                                               │
│  ┌─────────┐  ┌──────────┐  ┌────────────┐  ┌─────────────┐ │
│  │ Retry   │  │ Drift    │  │ Dedup      │  │ Health      │ │
│  │ Queue   │  │ Monitor  │  │ Cache      │  │ Endpoint    │ │
│  └─────────┘  └──────────┘  └────────────┘  └─────────────┘ │
└──────────────────────────────────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────────────┐
│                    Google Calendar API                        │
│  ┌─────────┐  ┌──────────┐  ┌────────────┐  ┌─────────────┐ │
│  │ Events  │  │ Channels │  │ Calendar   │  │ Free/Busy   │ │
│  │ API     │  │ API      │  │ List API   │  │ API         │ │
│  └─────────┘  └──────────┘  └────────────┘  └─────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

## Key Modules

### `src/app/lib/google.ts`
- Creates global OAuth2 client using shared credentials.
- Maintains per-doctor OAuth2 clients via `doctorClients` Map.
- Provides helpers for creating, setting, and removing per-doctor clients.

### `src/app/lib/googleCalendar.ts`
Core sync engine with:
- **CRUD operations**: `createCalendarEvent`, `updateCalendarEvent`, `deleteCalendarEvent`
- **Sync orchestrator**: `syncBooking` handles 5 cases (create, update, delete, recreate on 404, retry on transient error)
- **Incremental sync**: `fetchDoctorEvents` with syncToken support
- **Conflict detection**: `hasSignificantDrift`, `detectConflicts`
- **Busy time import**: `importBusyTimes` creates `BlockedSlot` records from non-booking events

### `src/app/lib/googleChannels.ts`
Push notification lifecycle management:
- `watchCalendar`: Creates new webhook channel with 7-day TTL
- `stopChannel`: Stops a channel via Google API
- `renewChannels`: Renews channels expiring within 24 hours

### `src/app/lib/channelScheduler.ts`
Reliability improvements:
- `renewExpiringChannels`: Retries failed renewals (up to 3 attempts)
- `cleanupObsoleteChannels`: Removes stopped/errored channels older than 7 days
- `deduplicateChannels`: Ensures only one active channel per doctor/calendar pair
- `getChannelHealth`: Returns channel status counts

### `src/app/lib/webhookVerifier.ts`
Webhook security:
- Validates all X-Goog-* headers (channel ID, resource ID, token, expiration)
- Replay attack prevention with in-memory cache
- Message number deduplication

### `src/app/lib/notificationDedup.ts`
Distributed deduplication:
- Stores processed notification keys in `ProcessedNotification` table
- TTL of 24 hours with automatic cleanup
- Safe for multi-instance deployments

### `src/app/lib/quotaManager.ts`
Google API quota protection:
- Token bucket rate limiting (configurable RPS)
- Sliding window rate limiting
- Exponential backoff with jitter
- Retry-After header support
- Daily quota counters with configurable alert threshold
- `withQuotaProtection` wrapper for automatic throttling

### `src/app/lib/oauthLifecycle.ts`
OAuth token lifecycle:
- Automatic refresh before expiration (5-minute lead time)
- Token refresh retry (3 attempts, exponential backoff)
- Permanent failure detection (invalid_grant, invalid_client)
- Token revocation flow
- Admin notification on permanent failure
- Batch refresh for all expiring/expired tokens

### `src/app/lib/driftMonitor.ts`
Nightly drift verification:
- Compares booking vs Google event counts
- Detects missing events (booking has eventId, Google doesn't)
- Detects orphan events (Google has event, no booking)
- Detects modified events (time/duration drift > 1 minute)
- Generates reconciliation report with healthy/degraded/unhealthy status

### `src/app/lib/recurringEvents.ts`
RRULE-based recurring slot expansion:
- Parses RFC 5545 RRULE strings
- Supports DAILY, WEEKLY, MONTHLY, YEARLY frequencies
- BYDAY and BYMONTHDAY filtering
- Expands into concrete `BlockedSlot` records

## Data Flow

### Booking Created → Calendar Sync
```
Booking created → syncBooking() → createCalendarEvent() → Google Calendar
                                           ↓
                                  On transient error → enqueueRetry() → CalendarSyncJob
                                           ↓
                                  Retry worker → process batch → syncBooking() retry
```

### Push Notification → Incremental Sync
```
Google sends webhook → POST /api/google/webhook
                           ↓
                    verifyWebhook() → validate headers, check channel, prevent replay
                           ↓
                    processSync() → fetchDoctorEvents() with syncToken
                           ↓
                    handleGoogleEvent() → update booking / import busy / detect conflicts
                           ↓
                    CalendarSyncState → syncToken updated for next sync
```

### Channel Renewal
```
Cron trigger → POST /api/cron/renew-channels
                    ↓
             renewExpiringChannels() → find channels expiring within 24h
                    ↓
             stop old channel → watch new channel (retry 3x)
                    ↓
             deduplicateChannels() → stop duplicates
                    ↓
             cleanupObsoleteChannels() → remove old stopped/errored
```

### OAuth Refresh
```
Token expiring → getDoctorAuthClient() → refreshDoctorToken()
                    ↓
             On success → update DoctorCalendarToken, set client
                    ↓
             On permanent failure → mark revoked, notify admin
                    ↓
             On transient failure → retry 3x with backoff
```

## Retry Queue

The retry queue uses `CalendarSyncJob` records with the following flow:

1. Booking sync fails with transient error (429, 5xx, network)
2. `enqueueRetry()` creates a `CalendarSyncJob` with `nextRetryAt`
3. Retry worker (triggered via cron or HTTP) acquires distributed lock
4. Processes batch of pending jobs where `nextRetryAt <= now`
5. For each job: sets `processing`, calls `syncBooking()`, on success deletes job
6. On failure: increments `attempt`, schedules next retry with exponential backoff
7. After 5 failed attempts: marks job as `failed`
8. Crash recovery: jobs stuck in `processing` for >10 min reset to `pending`

## Channel Lifecycle

```
Created (active) ──→ Expiring (<24h) ──→ Expired
     │                     │
     │                     ├── Renew → active (7 more days)
     │                     │
     │                     └── Fail → error
     │
     └── Stopped (after 7 days → deleted)
```

## Database Schema

Key models:

- **`Doctor`**: `calendarId` (Google Calendar ID)
- **`Booking`**: `calendarEventId`, `calendarLink`, `calendarSynced`, `calendarLastSyncedAt`
- **`BlockedSlot`**: `syncedToGoogle`, `googleEventId`, `blockingSource`, `recurringSlotId`
- **`CalendarChannel`**: Channel state with status tracking
- **`CalendarSyncState`**: Per-doctor sync token for incremental sync
- **`CalendarSyncJob`**: Retry queue with attempt tracking and exponential backoff
- **`CalendarRetryLock`**: Distributed lock for retry worker
- **`DoctorCalendarToken`**: Per-doctor OAuth tokens with status
- **`RecurringBlockedSlot`**: RRULE-based recurring time blocks
- **`ProcessedNotification`**: Distributed dedup cache for webhook notifications

## Monitoring

- **Health endpoint**: `GET /api/health` with `?check=google-calendar` sub-check
- **Metrics endpoint**: `GET /api/metrics` (Prometheus format) or `GET /api/metrics?format=json`
- **Key metrics**: request count, failure count, sync duration, channel count, quota usage, OAuth refresh count
- **Audit logging**: All Google Calendar actions logged to `AuditLog` table
