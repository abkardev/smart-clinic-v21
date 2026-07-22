# Google Calendar Troubleshooting Guide

## Common Issues

### Issue: Bookings not syncing to Google Calendar

**Symptoms:**
- `calendarSynced` remains `false` on bookings
- Health check shows degraded sync ratio

**Checklist:**
1. Verify Google Calendar credentials:
   ```bash
   GET /api/health?check=google-calendar
   ```
   Check `googleCalendar.status` is `healthy`.

2. Check retry queue:
   - `calendarRetry.pendingJobs` — jobs waiting to be retried
   - `calendarRetry.failedJobs` — jobs that exhausted retries
   - `calendarRetry.oldestPendingMinutes` — how long the oldest job has been waiting

3. Check OAuth tokens:
   - `oAuthTokens.expired` — expired tokens that need refresh
   - `oAuthTokens.revoked` — tokens that need reconnection

4. Check channel status:
   - `calendarChannels.activeChannels` — active channels
   - `calendarChannels.expiredChannels` — expired channels

5. Check sync backlog:
   - `syncBacklog.syncRatio` — percentage of synced bookings
   - `syncBacklog.unsyncedBookings` — count of unsynced bookings

**Resolution:**
- If retry queue has pending jobs: trigger retry worker
- If OAuth tokens expired: doctor should reconnect their calendar
- If channels expired: trigger channel renewal
- If credentials incomplete: check `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`

---

### Issue: Google API rate limits (429 errors)

**Symptoms:**
- `google_calendar_failures_total` counter increasing
- Retry queue filling up with 429 errors
- `google_calendar_quota_remaining` gauge at 0

**Root Cause:**
Exceeding Google Calendar API quota (default: 1,000,000 requests/day, 10 requests/second/user).

**Resolution:**
1. Check quota usage: `GET /api/metrics?format=json` → `quota`
2. The quota protection system (`quotaManager.ts`) automatically:
   - Limits requests to configured RPS (default: 10/s)
   - Applies exponential backoff with jitter on 429 responses
   - Respects `Retry-After` headers from Google
   - Tracks daily quota usage
3. If daily quota is near limit:
   - Reduce `GOOGLE_RATE_LIMIT_RPS` in environment
   - Wait for quota reset at midnight (UTC)
   - Request higher quota from Google Cloud Console

**Configuration:**
```
GOOGLE_RATE_LIMIT_RPS=10          # Requests per second
GOOGLE_DAILY_QUOTA=1000000        # Daily request limit
GOOGLE_BURST_LIMIT=20             # Token bucket burst size
GOOGLE_QUOTA_ALERT_AT=0.8         # Alert at 80% usage
```

---

### Issue: Webhook notifications not being processed

**Symptoms:**
- Changes in Google Calendar not reflecting in SmartClinic
- No `GOOGLE_WEBHOOK_RECEIVED` audit events

**Checklist:**
1. Verify `NEXT_PUBLIC_APP_URL` is set and publicly accessible
2. Check the webhook logs for incoming requests
3. Verify channels are active:
   ```json
   GET /api/health → calendarChannels
   ```
4. Check for replay detection: if `verifyWebhook` detects replay, notifications are silently dropped

**Resolution:**
- Renew channels: `POST /api/cron/renew-channels`
- If `NEXT_PUBLIC_APP_URL` changed, channels must be recreated
- Check Google Cloud Console for push notification delivery status

---

### Issue: OAuth token expired or revoked

**Symptoms:**
- Doctor's bookings stop syncing
- `GOOGLE_OAUTH_EXPIRED` audit events
- `oAuthTokens.revoked` > 0 in health check

**Resolution:**
1. Notify doctor to reconnect: click "Connect Calendar" in settings
2. Check if token was revoked by user in Google Account settings
3. If refresh token permanently expired:
   - Doctor must complete the OAuth flow again
   - This is expected if the app was in testing mode or token is older than 7 days without use

**Automatic Recovery:**
- `oauthLifecycle.refreshDoctorToken()` attempts refresh 3 times
- If permanent failure: marks as `revoked` and notifies admin
- `oauthLifecycle.refreshAllExpiringTokens()` runs periodically to proactively refresh tokens

---

### Issue: Channels expired and not renewing

**Symptoms:**
- `calendarChannels.activeChannels` = 0
- `calendarChannels.expiredChannels` > 0
- No webhook notifications

**Resolution:**
1. Trigger renewal: `POST /api/cron/renew-channels`
2. Check cron job is scheduled to run at least daily
3. Verify Google Calendar API has `watch` scope enabled
4. The channel auto-renew process handles:
   - Retries failed renewals 3 times
   - Stops duplicate channels
   - Cleans up obsolete channels after 7 days

---

### Issue: Duplicate bookings or events

**Symptoms:**
- Multiple events in Google Calendar for same booking
- Duplicate blocked slots

**Resolution:**
1. Check `ProcessedNotification` table for duplicate webhook processing
2. The dedup system uses `channelId::resourceId::messageNumber` as unique key
3. Replay cache has 24-hour TTL
4. If duplicates persist:
   - Check for multiple instances processing the same webhook
   - Verify `POST /api/cron/drift-check` report for missing/orphan events

---

### Issue: Drift between booking and Google Calendar

**Symptoms:**
- `DRIFT_DETECTED` audit events
- Health check shows `syncBacklog.status` degraded or unhealthy

**Resolution:**
1. Run drift check: `POST /api/cron/drift-check`
2. Review report for:
   - Missing events (booking has eventId, Google doesn't)
   - Orphan events (Google has event, no corresponding booking)
   - Modified events (time/duration drift > 1 minute)
3. For missing events: trigger `POST /api/doctors/sync-google` for the affected doctor
4. For orphan events: they may be legitimate non-booking events (meetings, out-of-office)
5. For modified events: investigate if changes were made directly in Google Calendar vs SmartClinic

---

## Diagnostic Commands

```bash
# Full health check (includes all calendar checks)
curl GET /api/health

# Calendar-specific health
curl GET /api/health?check=google-calendar

# Metrics (Prometheus format)
curl GET /api/metrics

# Metrics (JSON format)
curl GET /api/metrics?format=json

# Trigger channel renewal
curl -X POST /api/cron/renew-channels

# Trigger drift check
curl -X POST /api/cron/drift-check

# Trigger recurring slot expansion
curl -X POST /api/cron/expand-slots

# Sync a specific doctor
curl -X POST /api/doctors/sync-google -H "Authorization: Bearer $TOKEN" -d '{"doctorId":"xxx"}'

# Sync all doctors
curl -X POST /api/doctors/sync-all -H "Authorization: Bearer $TOKEN"
```

## Environment Variables Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GOOGLE_CLIENT_ID` | Yes | - | OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Yes | - | OAuth client secret |
| `GOOGLE_REFRESH_TOKEN` | Yes* | - | Global refresh token |
| `GOOGLE_REDIRECT_URI` | Yes | - | OAuth callback URL |
| `NEXT_PUBLIC_APP_URL` | Yes | - | Public app URL (for webhooks) |
| `CALENDAR_INTERNAL_SECRET` | No | - | Auth for retry worker |
| `CALENDAR_RETRY_ENABLED` | No | `true` | Enable retry queue |
| `CALENDAR_RETRY_BATCH_SIZE` | No | `10` | Batch size for retry worker |
| `GOOGLE_RATE_LIMIT_RPS` | No | `10` | Requests per second limit |
| `GOOGLE_DAILY_QUOTA` | No | `1000000` | Daily API request limit |
| `GOOGLE_BURST_LIMIT` | No | `20` | Token bucket burst size |
| `GOOGLE_QUOTA_ALERT_AT` | No | `0.8` | Quota alert threshold (0-1) |

*Not required if all doctors use per-doctor OAuth
