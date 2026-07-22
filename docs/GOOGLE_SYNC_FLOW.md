# Google Calendar Sync Flow

## Overview

The sync flow handles bi-directional synchronization between SmartClinic bookings and Google Calendar events. It supports both push-based (webhook) and pull-based (incremental sync) synchronization.

## Sync Triggers

1. **Booking Created**: Immediately triggers `syncBooking()` to create Google Calendar event.
2. **Booking Updated**: Triggers `syncBooking()` to update existing event.
3. **Booking Cancelled**: Triggers `syncBooking()` to delete event.
4. **Push Notification**: Google sends webhook when events change → triggers incremental sync.
5. **Manual Sync**: Admin can trigger `POST /api/doctors/sync-all` or `POST /api/doctors/sync-google`.
6. **Retry Worker**: Failed syncs are retried via the retry queue.

## Sync Flow Diagram

```
                    ┌─────────────────────────────────┐
                    │         Booking Created          │
                    └────────────┬────────────────────┘
                                 │
                                 ▼
                    ┌─────────────────────────────────┐
                    │       syncBooking() invoked      │
                    └────────────┬────────────────────┘
                                 │
                    ┌────────────┴────────────┐
                    │                         │
                    ▼                         ▼
            ┌─────────────────┐     ┌─────────────────┐
            │  Has calendarId?│     │ No calendarId?   │
            └────────┬────────┘     └────────┬────────┘
                     │                       │
                     ▼                       ▼
            ┌─────────────────┐     ┌─────────────────┐
            │  Try Update     │     │  Create Event   │
            │  Event          │     │  in Google      │
            └────────┬────────┘     └────────┬────────┘
                     │                       │
              ┌──────┴──────┐                │
              │             │                │
              ▼             ▼                ▼
       ┌──────────┐  ┌──────────┐     ┌──────────┐
       │ Success  │  │ 404 Not  │     │ Success  │
       │          │  │ Found    │     │          │
       └──────────┘  └────┬─────┘     └──────────┘
              │            │                │
              │            ▼                │
              │     ┌──────────┐            │
              │     │ Recreate │            │
              │     │ Event    │            │
              │     └──────────┘            │
              │            │                │
              └──────┬─────┴────────────────┘
                     │
                     ▼
            ┌─────────────────────────────────┐
            │  Update Booking in Database:     │
            │  - calendarSynced = true         │
            │  - calendarLastSyncedAt = now    │
            │  - store calendarEventId/link    │
            └─────────────────────────────────┘
```

## Incremental Sync Flow

```
Push Notification Received (x-goog-resource-state: exists)
                    │
                    ▼
      ┌─────────────────────────────┐
      │   verifyWebhook()           │
      │   - Validate message number │
      │   - Replay attack check     │
      └─────────────────────────────┘
                    │
                    ▼
      ┌─────────────────────────────┐
      │   processSync(doctorId)     │
      └────────────┬────────────────┘
                   │
                   ▼
      ┌─────────────────────────────┐
      │   fetchDoctorEvents()       │
      │   - With syncToken (if any) │
      │   - Full sync (if no token) │
      └────────────┬────────────────┘
                   │
                   ▼
      ┌─────────────────────────────┐
      │   For each event:           │
      │   handleGoogleEvent()       │
      └────────────┬────────────────┘
                   │
        ┌──────────┴──────────┐
        │                     │
        ▼                     ▼
  ┌──────────────┐    ┌──────────────┐
  │ Booking      │    │ Non-Booking  │
  │ Event        │    │ Event        │
  └──────┬───────┘    └──────┬───────┘
         │                   │
         ▼                   ▼
  ┌──────────────┐    ┌──────────────┐
  │ Update       │    │ Import as    │
  │ Booking      │    │ BlockedSlot  │
  │ (detect      │    │ (busy time)  │
  │ conflicts)   │    │              │
  └──────────────┘    └──────────────┘
         │
         ▼
  ┌─────────────────────────────┐
  │   Update CalendarSyncState  │
  │   - Store nextSyncToken     │
  └─────────────────────────────┘
```

## Conflict Detection

When processing a Google Calendar event that corresponds to an existing booking:

1. **Time Drift**: Compare booking start time vs Google event start time. If >1 minute difference, log as conflict.
2. **Duration Drift**: Compare expected duration (slotDuration) vs actual Google event duration. If >1 minute difference, log as conflict.
3. **Missing Event**: Booking has `calendarEventId` but Google event no longer exists — log as missing.
4. **Moved Event**: Google event date/time differs from booking — update booking and log conflict.

## Busy Time Import

Non-booking Google Calendar events (meetings, out-of-office, vacations, conferences) are imported as `BlockedSlot` records with `blockingSource = 'google_import'`. This prevents double-booking during those times.

## Retry Logic

Transient errors (429 rate limit, 5xx server errors, network timeouts) trigger the retry queue:

| Attempt | Delay    |
|---------|----------|
| 1       | 1 min    |
| 2       | 5 min    |
| 3       | 15 min   |
| 4       | 60 min   |
| 5       | 1440 min |

After 5 failed attempts, the job is marked as `failed` and requires manual intervention.

## Sync Backlog Monitoring

The health endpoint (`GET /api/health`) reports:
- Sync ratio (synced bookings / total bookings) for the last 7 days
- Doctors with unsynced bookings
- Oldest pending retry job
- Number of failed/processing jobs
