# SmartClinic Operations Guide

## System Overview

SmartClinic v21 is a Next.js 14 application running on Node.js 22 with PostgreSQL.

## Endpoints

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/health` | GET | None | Full health check (default) |
| `/api/health?check=liveness` | GET | None | K8s liveness probe |
| `/api/health?check=readiness` | GET | None | K8s readiness probe |
| `/api/health?check=startup` | GET | None | K8s startup probe |
| `/api/system/dashboard` | GET | admin+ | Operational dashboard data |
| `/api/system/metrics` | GET | None | Prometheus-format metrics |
| `/api/system/report` | GET | admin+ | Production system report |
| `/api/system/cleanup` | POST | admin+ | Run cleanup jobs |
| `/api/system/maintenance` | GET | superadmin | DB maintenance info |
| `/api/system/backup` | GET | superadmin | Backup verification |
| `/api/internal/calendar/retry` | POST | Internal | Retry worker trigger |
| `/api/metrics` | GET | admin+ | JSON metrics snapshot |

## Environment Variables

### Required
- `DATABASE_URL` — PostgreSQL connection string
- `JWT_SECRET` — JWT signing secret (min 32 chars)

### Calendar
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`
- `CALENDAR_RETRY_ENABLED` — `true` to enable retry worker
- `CALENDAR_RETRY_BATCH_SIZE` — jobs per batch (default: 10)
- `CALENDAR_INTERNAL_SECRET` — retry worker auth token

### Messaging
- `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`, `WHATSAPP_VERIFY_TOKEN`
- `INSTAGRAM_TOKEN`, `INSTAGRAM_VERIFY_TOKEN`

### Monitoring
- `SENTRY_DSN` — Sentry error tracking
- `LOG_LEVEL` — `trace`, `debug`, `info`, `warn`, `error` (default: `info`)

### Other
- `BLOB_READ_WRITE_TOKEN` — Vercel Blob storage
- `RESEND_API_KEY` — Email service
- `NEXT_PUBLIC_APP_URL` — Public app URL

## Scheduler

The retry worker is a POST-only endpoint (`/api/internal/calendar/retry`) designed to be triggered by an external scheduler:

- **Vercel Cron**: Configure in `vercel.json`
- **External cron**: `curl -X POST https://app.com/api/internal/calendar/retry -H "Authorization: Bearer $CALENDAR_INTERNAL_SECRET"`
- **Lock TTL**: 5 minutes (prevents concurrent runs)
- **Max attempts**: 5 per job
- **Backoff**: 1min, 5min, 15min, 1hr, 24hr

## Cleanup

Run via `POST /api/system/cleanup` (admin+). Removes:
- Expired WhatsApp sessions (past `expiresAt`)
- Expired rate limits (past `expiresAt`)
- Completed/failed retry jobs older than 7 days
- Expired idempotency locks (past `expiresAt`)
- Password reset tokens (all current tokens cleared)
- Audit logs older than 90 days

## Monitoring

### Health Checks
- **Liveness** (`?check=liveness`): Returns immediately — process is alive
- **Startup** (`?check=startup`): Verifies database connectivity
- **Readiness** (`?check=readiness`): Verifies database + environment

### Prometheus Metrics
`GET /api/system/metrics` returns Prometheus-format text with:
- All counters, histograms, and gauges from the in-process metrics store
- Process memory (RSS MB)
- CPU load average
- Uptime seconds

### Sentry
Error tracking is configured via `@sentry/nextjs`. Captures server/client/edge errors automatically. Logger also forwards `warn`/`error` to Sentry.

## Kubernetes Probes

```yaml
livenessProbe:
  httpGet:
    path: /api/health?check=liveness
    port: 3000
  initialDelaySeconds: 5
  periodSeconds: 10

readinessProbe:
  httpGet:
    path: /api/health?check=readiness
    port: 3000
  initialDelaySeconds: 10
  periodSeconds: 15

startupProbe:
  httpGet:
    path: /api/health?check=startup
    port: 3000
  initialDelaySeconds: 3
  periodSeconds: 5
  failureThreshold: 30
```

## Deployment

See [RUNBOOK.md](./RUNBOOK.md) for deployment procedures.
