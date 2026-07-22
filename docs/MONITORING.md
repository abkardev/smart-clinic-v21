# Monitoring Guide

## Overview

SmartClinic uses multiple monitoring layers:

| Layer | Tool | Purpose |
|---|---|---|
| Health checks | Built-in `/api/health` | Uptime & availability |
| Error tracking | Sentry | Captures exceptions, crashes, and performance issues |
| Application logs | Console + Logger | Structured JSON logs with correlation IDs |
| API performance | Vercel Analytics | Request duration, error rates, traffic |
| Database | Neon Dashboard | Connection count, query performance, storage |
| Infrastructure | Vercel Dashboard | Deployment status, function invocations |

---

## Health Endpoint

`GET /api/health` provides a comprehensive health check.

### Response

```json
{
  "status": "ok",
  "timestamp": "2024-01-01T12:00:00.000Z",
  "uptime": 123456,
  "database": "connected",
  "environment": "production",
  "memory": {
    "rss": 123456789,
    "heapTotal": 98765432,
    "heapUsed": 65432100
  }
}
```

### Monitoring with Uptime Checks

Configure your monitoring service to hit `/api/health` every 30-60 seconds:

```bash
# curl
curl -s -o /dev/null -w "%{http_code}" https://your-app.vercel.app/api/health

# With jq for parsing
curl -s https://your-app.vercel.app/api/health | jq '.status'
```

---

## Logs

### Log Levels

| Level | Purpose | Production Default |
|---|---|---|
| `error` | Critical failures requiring immediate attention | ✓ |
| `warn` | Recoverable issues, degraded functionality | ✓ |
| `info` | Request lifecycle, business events | ✓ |
| `debug` | Detailed flow information | ✗ |
| `trace` | Verbose diagnostic data | ✗ |

### Log Format

```
[correlationId] [timestamp] LEVEL message { "json": "metadata" }
```

Example:

```
[abc123def456] [2024-01-01T12:00:00.000Z] INFO Request GET /api/bookings { "correlationId": "abc123def456", "method": "GET", "route": "/api/bookings", "duration": 45, "environment": "production" }
```

### Viewing Logs

**Vercel:**
1. Go to Vercel Dashboard > Project > Logs
2. Filter by log type (build, function, edge)
3. Search by correlation ID for request tracing

**Docker:**
```bash
docker logs smartclinic --tail 100 -f
```

**Local development:**
```bash
npm run dev 2>&1 | grep "ERROR\|WARN"
```

---

## Sentry

### Error Categories

1. **API Route Errors** — Uncaught exceptions in route handlers
2. **React Runtime Errors** — Component render crashes
3. **Unhandled Promise Rejections** — Async failures not caught
4. **Prisma Exceptions** — Database query failures (tagged with `prisma: true`)

### Configuration

Sentry is configured in three files:

| File | Scope |
|---|---|
| `sentry.client.config.ts` | Browser (React) |
| `sentry.server.config.ts` | Node.js API routes |
| `sentry.edge.config.ts` | Edge middleware |

### Viewing Errors

1. Go to [Sentry Dashboard](https://sentry.io)
2. Select the SmartClinic project
3. Filter by environment (`production`, `development`)
4. View **Issues** for unhandled errors
5. View **Performance** for transaction traces

### Performance Monitoring

Sentry captures:
- API route response times (sampled at 10% in production)
- Database query performance (via Prisma integration)
- Frontend page load performance (via browser tracing)

---

## Performance Monitoring

### Key Metrics

| Metric | Target | Where to Monitor |
|---|---|---|
| API response time (p95) | < 500ms | Vercel Analytics, Sentry |
| Database query time | < 100ms | Neon Dashboard |
| Memory usage | < 512MB | Docker stats, Vercel |
| Error rate | < 1% | Sentry, Vercel |
| Uptime | 99.9% | Monitoring service |

### Vercel Analytics

1. Go to Vercel Dashboard > Project > Analytics
2. View **Web Analytics** for page views and user sessions
3. View **Speed Insights** for Core Web Vitals

### Neon Database Monitoring

1. Go to [Neon Console](https://console.neon.tech) > Project
2. **Monitoring** tab shows:
   - Connections (active, idle, waiting)
   - CPU usage
   - Storage size
   - Query performance (slow queries)

---

## Database Monitoring

### Critical Queries

Monitor these queries for performance:

```sql
-- Active connections
SELECT count(*) FROM pg_stat_activity WHERE state = 'active';

-- Long-running queries
SELECT pid, now() - pg_stat_activity.query_start AS duration, query
FROM pg_stat_activity
WHERE state = 'active' AND now() - pg_stat_activity.query_start > interval '5 seconds';

-- Table sizes
SELECT relname, n_live_tup, n_dead_tup
FROM pg_stat_user_tables
ORDER BY n_live_tup DESC;
```

### Connection Pool Monitoring

On Neon:
- Active connections should stay below 80% of the pool limit
- If you see `Timed out fetching a new connection from the connection pool`, switch to the `-pooler` connection string

---

## Alerting Recommendations

Set up alerts for:

1. **HTTP 5xx rate > 1%** — Application errors
2. **Response time p95 > 1s** — Performance degradation
3. **Database connection count > 80%** — Pool exhaustion risk
4. **Sentry error spike** — New bug or regression
5. **Health check failure** — Application down

### Alert Channels

- Slack (recommended for development team)
- Email (for critical alerts)
- PagerDuty/OpsGenie (for on-call rotations)

---

## Dashboard Setup

Create a monitoring dashboard with:

1. **Application Health** — Health endpoint status, uptime percentage
2. **API Performance** — Response time p50/p95/p99, request rate
3. **Error Rate** — 4xx rate, 5xx rate, Sentry issue count
4. **Database** — Connection count, query duration, storage
5. **Business Metrics** — Bookings created, WhatsApp messages processed, active users

Recommended tools:
- [Grafana](https://grafana.com) — Unified dashboard
- [Datadog](https://datadoghq.com) — APM + infrastructure
- [Better Stack](https://betterstack.com) — Uptime + log management
