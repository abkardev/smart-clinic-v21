# SmartClinic Maintenance Guide

## Routine Maintenance

### Daily
- Review health endpoint for degraded services
- Monitor retry queue size (should remain near zero)
- Check Sentry for new errors

### Weekly
- Review slow queries via `/api/system/maintenance`
- Check table sizes and vacuum recommendations
- Verify backup status via `/api/system/backup`
- Run manual cleanup: `POST /api/system/cleanup`

### Monthly
- Review audit log retention (90-day default)
- Analyze index usage via maintenance endpoint
- Check for unused indexes
- Review scheduler health

## Database Maintenance

### Analyze Tables
The maintenance endpoint provides table statistics and vacuum recommendations:
- `GET /api/system/maintenance` (superadmin only)
- Returns row counts, sizes, last analyze times
- Recommends tables needing vacuum

### Index Usage
The maintenance endpoint reports:
- Index scan counts (frequently scanned = healthy)
- Index tuple counts
- Unused indexes (scanCount near zero)

### Table Size Report
Each table reports:
- Total size (including indexes and TOAST)
- Row count estimates
- Human-readable size formatting

## Cleanup Jobs

Run via `POST /api/system/cleanup` (admin+). Scheduled jobs remove:

| Data | Retention | Schedule |
|------|-----------|----------|
| WhatsApp sessions | Until `expiresAt` | Daily |
| Rate limits | Until `expiresAt` | Daily |
| Completed retry jobs | 7 days | Daily |
| Failed retry jobs | 7 days | Daily |
| Idempotency locks | Until `expiresAt` | Daily |
| Password reset tokens | Immediate (all) | Daily |
| Audit logs | 90 days | Daily |

## Backup Verification

`GET /api/system/backup` (superadmin only) provides:
- Latest backup age
- Database integrity check (record counts)
- Recovery status
- Platform-specific information

For Vercel/Neon: Backups are managed automatically. Verify via Neon dashboard.
For self-hosted: Requires external `pg_dump` cron job.

## Scaling

### Read Replicas
Add connection string with read replica support:
```
DATABASE_URL=postgres://user:pass@primary:5432/db
DATABASE_REPLICA_URL=postgres://user:pass@replica:5432/db
```

### Connection Pooling
For Neon: Use pooled connection string (with `-pooler` suffix):
```
DATABASE_URL=postgres://user:pass@ep-example-pooler.us-east-1.aws.neon.tech/db
```

### Vercel Serverless
- Cold starts are minimized by keeping the bundle lean
- Max duration for retry worker: 300 seconds
- Default function timeout: 60 seconds
- CPU/Memory: Auto-scaled by Vercel

## Monitoring Setup

### Prometheus Integration
Point Prometheus to:
```
scrape_configs:
  - job_name: 'smartclinic'
    scrape_interval: 15s
    metrics_path: '/api/system/metrics'
    static_configs:
      - targets: ['app.com']
```

### Sentry Alerts
Configure in Sentry dashboard:
- Error rate > 5% in 5 minutes
- P99 latency > 5 seconds
- Zero successful transactions in 5 minutes

### Health Check Monitoring
Configure external monitors (Pingdom, Better Uptime, etc.):
- Check interval: 1 minute
- Expected status: 200
- Alert on: 3 consecutive failures
