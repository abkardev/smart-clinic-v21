# Google Calendar Operations Guide

## Operational Procedures

### 1. Daily Operations

#### Monitor Sync Health
```bash
# Run daily at 09:00
curl GET /api/health
```
Expected: All checks should show `status: "healthy"`.

Watch for:
- `syncBacklog.syncRatio < 0.9` → degraded sync
- `calendarRetry.failedJobs > 50` → too many failed syncs
- `calendarRetry.oldestPendingMinutes > 60` → backlog growing
- `oAuthTokens.expired > 3` → expired tokens need attention

#### Check Retry Queue
```bash
# Run every 4 hours
curl GET /api/health | jq '.checks.calendarRetry'
```
If `pendingJobs > 0` and `oldestPendingMinutes > 60`, trigger retry worker.

---

### 2. Weekly Operations

#### Run Drift Verification
```bash
# Run weekly on Sunday
curl -X POST /api/cron/drift-check
```
Review the report for:
- Total missing events (booking has eventId, Google doesn't)
- Total orphan events (Google has event, no booking)
- Total modified events (time/duration drift)

#### Renew Channels
```bash
# Run daily (automated via cron)
curl -X POST /api/cron/renew-channels
```
Expected output:
```json
{
  "renewal": { "renewed": 5, "failed": 0, "skipped": 0 },
  "dedup": 0,
  "cleanup": 0
}
```

#### Expand Recurring Slots
```bash
# Run weekly
curl -X POST /api/cron/expand-slots
```

---

### 3. Monthly Operations

#### Full Reconciliation
1. Run drift check across all doctors
2. For each doctor with issues:
   - Review missing events → trigger sync
   - Review orphan events → identify as blocked slot or legitimate event
   - Review modified events → determine source of change
3. Generate report and archive

#### OAuth Token Audit
1. Check token health: `GET /api/health?check=google-calendar`
2. For revoked tokens: contact doctors to reconnect
3. For expiring tokens: verify auto-refresh is working

#### Quota Review
1. Check `GET /api/metrics?format=json` → `quota`
2. Review daily peak usage
3. Adjust rate limits if approaching quota limits
4. Request quota increase from Google if needed

---

### 4. Incident Response

#### Incident: All channels expired

**Symptoms:**
- No webhook notifications for hours
- `calendarChannels.activeChannels` = 0

**Response:**
```bash
# Step 1: Trigger emergency renewal
curl -X POST /api/cron/renew-channels

# Step 2: Verify channels created
curl GET /api/health | jq '.checks.calendarChannels'

# Step 3: Trigger full sync for all doctors
curl -X POST /api/doctors/sync-all -H "Authorization: Bearer $ADMIN_TOKEN"

# Step 4: Investigate root cause
# - Was NEXT_PUBLIC_APP_URL changed?
# - Is Google Calendar API accessible?
# - Any recent code changes?
```

#### Incident: Retry queue stuck

**Symptoms:**
- `processingJobs` > 5
- Jobs stuck in `processing` for hours

**Response:**
```bash
# Step 1: Crash recovery (automatic for jobs >10 min)
# Reset stuck processing jobs to pending

# Step 2: If crash recovery doesn't work, manually reset:
UPDATE calendar_sync_jobs
SET status = 'pending', updated_at = NOW()
WHERE status = 'processing'
AND updated_at < NOW() - INTERVAL '10 minutes';

# Step 3: Trigger retry worker
curl -X POST /api/internal/calendar/retry -H "Authorization: Bearer $CALENDAR_INTERNAL_SECRET"

# Step 4: Monitor recovery
curl GET /api/health | jq '.checks.calendarRetry'
```

#### Incident: OAuth token failure

**Symptoms:**
- Doctor's bookings not syncing
- `GOOGLE_OAUTH_EXPIRED` audit event logged

**Response:**
```bash
# Step 1: Verify token status
curl GET /api/health | jq '.checks.oAuthTokens'

# Step 2: Attempt token refresh
# Auto-refresh handles this, but can be triggered by:
# - Touching the doctor's calendar operation

# Step 3: If permanently revoked:
# - Notify doctor to reconnect via Settings → Calendar
# - Doctor: "Connect Calendar" → Google OAuth → Grant Access

# Step 4: After reconnection, verify sync resumes
curl -X POST /api/doctors/sync-google \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"doctorId":"affected-doctor-id"}'
```

---

### 5. Cron Jobs Setup

The following endpoints should be called on a schedule:

| Endpoint | Frequency | Timeout | Purpose |
|----------|-----------|---------|---------|
| `POST /api/cron/renew-channels` | Every 6 hours | 30s | Renew expiring channels |
| `POST /api/cron/drift-check` | Daily at 02:00 | 120s | Nightly drift verification |
| `POST /api/cron/expand-slots` | Daily at 03:00 | 60s | Expand recurring slots |
| `POST /api/internal/calendar/retry` | Every 5 minutes | 300s | Process retry queue |
| `POST /api/google/channels` | Every 24 hours | 30s | Channel maintenance |

### Vercel Cron Jobs Configuration

```json
{
  "crons": [
    { "path": "/api/cron/renew-channels", "schedule": "0 */6 * * *" },
    { "path": "/api/cron/drift-check", "schedule": "0 2 * * *" },
    { "path": "/api/cron/expand-slots", "schedule": "0 3 * * *" },
    { "path": "/api/internal/calendar/retry", "schedule": "*/5 * * * *" }
  ]
}
```

---

### 6. Monitoring Thresholds

| Metric | Warning | Critical | Action |
|--------|---------|----------|--------|
| Sync ratio | < 90% | < 70% | Investigate retry queue, OAuth, channels |
| Failed retry jobs | > 10 | > 50 | Manual review of failed syncs |
| Processing jobs stuck | > 1 | > 5 | Crash recovery or manual reset |
| Active channels | < expected | 0 | Trigger channel renewal |
| Expired tokens | > 3 | > 10 | Notify doctors to reconnect |
| Daily quota usage | > 80% | > 95% | Check for abnormal request volume |
| OAuth refresh failures | > 0 | > 5 | Check token health, notify admin |

---

### 7. Maintenance

#### Adding a new doctor
1. Doctor is created with `calendarId` field (can be set to 'primary' by default)
2. If using global OAuth: sync starts automatically
3. If using per-doctor OAuth: doctor must connect calendar via settings
4. Watch channel is created automatically on first sync

#### Removing a doctor
1. Disable doctor: `DELETE /api/doctors/[id]`
2. Stop all watch channels
3. Revoke OAuth tokens
4. Clean up retry queue jobs

#### Updating Google Calendar API credentials
1. Update environment variables
2. Existing channels will continue working
3. New channels use the new credentials
4. No service disruption expected

---

### 8. Backup and Recovery

#### Data to backup
- `DoctorCalendarToken` table (OAuth tokens — store encrypted in database)
- `CalendarSyncState` table (sync tokens)
- Calendar channel state can be reconstructed

#### Recovery procedure
1. If database is restored from backup:
   - OAuth tokens will still work (they're Google tokens, not local)
   - Sync tokens may be invalid (Google syncTokens expire after 7 days)
   - Channels will need renewal (Google channels expire after 7 days)
2. After database restore:
   ```bash
   # Renew all channels
   curl -X POST /api/cron/renew-channels

   # Trigger full resync (syncToken will be invalid, triggering 410 → full sync)
   curl -X POST /api/doctors/sync-all -H "Authorization: Bearer $ADMIN_TOKEN"

   # Run drift check to verify
   curl -X POST /api/cron/drift-check
   ```

---

### 9. Performance Tuning

#### Scaling considerations
- **Rate limiting**: Default 10 RPS, adjust based on Google quota
- **Retry batch size**: Default 10, increase for higher throughput
- **Channel renewal window**: 24 hours before expiration, adjust based on cron frequency
- **Dedup TTL**: 24 hours, adjust based on expected notification volume

#### Recommended configuration
```env
# Standard setup (1-10 doctors)
CALENDAR_RETRY_BATCH_SIZE=10
GOOGLE_RATE_LIMIT_RPS=10

# Large setup (10-50 doctors)
CALENDAR_RETRY_BATCH_SIZE=25
GOOGLE_RATE_LIMIT_RPS=20

# Enterprise setup (50+ doctors)
CALENDAR_RETRY_BATCH_SIZE=50
GOOGLE_RATE_LIMIT_RPS=50
```
