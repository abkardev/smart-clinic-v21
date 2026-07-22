# SmartClinic Incident Response

## Incident Severity Levels

| Level | Definition | Response Time |
|-------|------------|---------------|
| **SEV1** | Application down or core functionality broken | Immediate |
| **SEV2** | Feature degraded, non-critical | 1 hour |
| **SEV3** | Minor issue, no user impact | Next business day |

## Incident Types

### 1. Application Down

**Symptoms**: Health endpoint returns 503, all requests fail.

**Checks**:
```bash
# Check basic health
curl -f https://app.com/api/health?check=liveness || echo "PROCESS DOWN"

# Check database
curl -f https://app.com/api/health?check=readiness || echo "READINESS FAILED"

# Check startup
curl -f https://app.com/api/health?check=startup || echo "STARTUP FAILED"

# Check system report
curl https://app.com/api/system/report -H "Authorization: Bearer $TOKEN"
```

**Actions**:
1. Check Vercel/Docker logs
2. Verify environment variables
3. Check database connectivity (`npx prisma db push --dry-run`)
4. Rollback to previous deployment if recent deploy

### 2. Database Issues

**Symptoms**: Health reports `database: unhealthy`, queries timeout.

**Checks**:
```bash
# Check maintenance info
curl https://app.com/api/system/maintenance -H "Authorization: Bearer $TOKEN"

# Check backup status
curl https://app.com/api/system/backup -H "Authorization: Bearer $TOKEN"
```

**Actions**:
1. Check connection pool (Neon/Postgres dashboard)
2. Run `VACUUM ANALYZE` if table bloat detected
3. Check for slow queries in pg_stat_activity
4. Restore from backup if data corruption

### 3. Google Calendar Sync Failure

**Symptoms**: Retry queue growing, failed jobs accumulating.

**Checks**:
```bash
# Check dashboard for queue stats
curl https://app.com/api/system/dashboard -H "Authorization: Bearer $TOKEN"

# Check health for calendar retry status
curl https://app.com/api/health
```

**Actions**:
1. Check Google Calendar credentials
2. Verify `GOOGLE_REFRESH_TOKEN` is valid
3. Run retry worker manually: `curl -X POST /api/internal/calendar/retry`
4. Check retry jobs in calendar_sync_jobs table

### 4. Scheduler Not Running

**Symptoms**: Retry queue never drains, pending jobs stuck.

**Checks**:
- `CALENDAR_RETRY_ENABLED` is `true`
- `CALENDAR_INTERNAL_SECRET` matches between cron and app
- Vercel Cron Jobs dashboard

**Actions**:
1. Manually trigger retry: `curl -X POST /api/internal/calendar/retry`
2. Verify cron configuration in `vercel.json`
3. Check audit log for `RETRY_WORKER_STARTED` events

### 5. High Error Rate

**Symptoms**: Error rate (last hour) is elevated.

**Checks**:
```bash
# Check dashboard
curl https://app.com/api/system/dashboard -H "Authorization: Bearer $TOKEN"

# Check Sentry dashboard
```

**Actions**:
1. Review Sentry for new error patterns
2. Check audit logs for failed operations
3. Identify affected users/features
4. Rollback if recent deployment introduced regression

## Database Recovery

### Backup Verification
```bash
curl https://app.com/api/system/backup -H "Authorization: Bearer $SUPERADMIN_TOKEN"
```

### Point-in-Time Recovery
For Neon/Postgres managed:
- Use provider's PITR feature
- Restore to new branch, verify data, promote

### Manual Recovery
```bash
# Restore from pg_dump
pg_restore -d smartclinic -U postgres latest.dump
```

## Post-Incident

1. Document timeline and root cause
2. Verify all health checks pass
3. Create or update runbook entry
4. Review monitoring coverage
