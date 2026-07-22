# Deployment Guide

## Prerequisites

- Node.js 22+
- PostgreSQL database (Neon recommended for production)
- Meta Business Suite account (WhatsApp + Instagram APIs)
- Google Cloud Console project (Calendar sync)
- Vercel account (recommended hosting)

---

## Vercel Deployment

### 1. Import Project

1. Go to [Vercel Dashboard](https://vercel.com/new)
2. Import your Git repository (GitHub/GitLab/Bitbucket)
3. Select the `smartclinic-nextjs-v21` directory

### 2. Configure Environment Variables

Add all variables from `.env.example` in the Vercel project settings:

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | Yes | Neon pooled connection string |
| `JWT_SECRET` | Yes | Generate with `openssl rand -hex 32` |
| `WHATSAPP_TOKEN` | Yes | Meta Business Suite |
| `WHATSAPP_PHONE_ID` | Yes | Meta Business Suite |
| `NEXT_PUBLIC_SENTRY_DSN` | No | For error tracking |
| `SENTRY_DSN` | No | For error tracking |
| `LOG_LEVEL` | No | Defaults to `info` in production |

See `.env.example` for the complete list.

### 3. Deploy

Vercel auto-deploys on every push to the connected branch. For manual deploy:

```bash
npx vercel --prod
```

### 4. Post-Deploy Checks

- Visit `/api/health` — should return 200
- Test login at `/login`
- Verify webhook endpoints are accessible

---

## Environment Variables

Every variable is documented in `.env.example` with its requirement level,
format, and example values. Key rules:

- `DATABASE_URL` must use the **pooled** connection string for Neon
- `JWT_SECRET` must be at least 32 random characters
- `NEXT_PUBLIC_SENTRY_DSN` starts with `https://` and ends with the project ID
- `CLINIC_TIMEZONE` must be a valid IANA timezone (e.g., `Asia/Riyadh`)

---

## Database Migration

### Before Deploy

```bash
# Generate the migration
npx prisma migrate dev --name describe_change

# Test it locally
npx prisma migrate deploy

# Commit the migration files
git add prisma/migrations
git commit -m "feat(db): add migration for ..."
```

### During Deploy

Vercel does NOT run migrations automatically. You must run them manually:

```bash
# Via Vercel CLI
npx vercel env pull .env.production
DATABASE_URL=$(grep DATABASE_URL .env.production | cut -d '=' -f2-)
npx prisma migrate deploy
```

## Scheduler Setup

The Calendar Retry Scheduler automatically processes failed Google Calendar sync jobs.

### Vercel

A `vercel.json` cron job is already configured to run every minute:

```json
{
  "crons": [
    { "path": "/api/internal/calendar/retry", "schedule": "* * * * *" }
  ]
}
```

Requires `CALENDAR_INTERNAL_SECRET` environment variable to be set.

### Docker

The `docker-compose.yml` includes a `cron` service that runs the retry endpoint every minute using Alpine's `crond`.

### Linux VPS

Add this line to your crontab (`crontab -e`):

```bash
* * * * * /usr/bin/curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3000/api/internal/calendar/retry -H "Authorization: Bearer $(cat /etc/smartclinic/CALENDAR_INTERNAL_SECRET)" -H "Content-Type: application/json" --max-time 30
```

Or use a cron file:

```bash
# /etc/cron.d/smartclinic-retry
* * * * * root /usr/bin/curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3000/api/internal/calendar/retry -H "Authorization: Bearer YOUR_SECRET" -H "Content-Type: application/json" --max-time 30 >> /var/log/smartclinic-retry.log 2>&1
```

### Rollback a Migration

```bash
# Option 1: Revert to a specific migration
npx prisma migrate resolve --rolled-back "<migration_name>"

# Option 2: Restore from backup and re-run up to the desired migration
pg_restore --dbname="$DATABASE_URL" --no-owner --no-acl --clean backup.dump
npx prisma migrate deploy
```

---

## Rollback

### Application Rollback

**Vercel:**
1. Go to Vercel Dashboard > Deployments
2. Find the previous working deployment
3. Click the three dots menu > **Promote to Production**

**Docker:**
```bash
docker pull smartclinic:previous-tag
docker stop smartclinic
docker run -d --name smartclinic --env-file .env smartclinic:previous-tag
```

### Database Rollback

```bash
# 1. Restore pre-deployment backup
pg_restore --dbname="$DATABASE_URL" --no-owner --no-acl --clean --if-exists pre_deployment_backup.dump

# 2. Reset Prisma migration state
npx prisma migrate resolve --applied "<migration_before_rollback>"

# 3. Verify
npx prisma migrate status
```

---

## Health Checks

### Endpoint

```
GET /api/health
```

Returns:

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

### Monitoring Health

```bash
# Curl
curl https://your-app.vercel.app/api/health

# Watch
watch -n 5 curl -s https://your-app.vercel.app/api/health | jq .

# Docker
docker inspect --format='{{json .State.Health}}' smartclinic
```

---

## Troubleshooting

### Build Failures

| Error | Cause | Fix |
|---|---|---|
| `Cannot find module '@prisma/client'` | Prisma not generated | Run `npx prisma generate` before build |
| `Module not found: Can't resolve 'jspdf'` | jsPDF excluded from server bundle | Already configured in `next.config.js` |
| `TypeError: Cannot destructure property` | Pages Router conflict | Ensure `src/pages_/` naming convention |
| `Connection pool exhausted` | Direct Neon connection | Use the `-pooler` connection string |

### Runtime Errors

| Symptom | Cause | Fix |
|---|---|---|
| 401 on all API routes | JWT_SECRET changed | Restore original JWT_SECRET |
| WhatsApp not responding | Token expired | Regenerate token in Meta Business Suite |
| Webhooks not arriving | Invalid verify token | Check WHATSAPP_VERIFY_TOKEN matches Meta config |
| Calendar sync failing | Refresh token expired | Re-run OAuth2 flow |
| Images not loading | BLOB token expired | Generate new token in Vercel Dashboard |

### Database Issues

```bash
# Check connection
psql "$DATABASE_URL" -c "SELECT 1"

# Check migration status
npx prisma migrate status

# Reset local database
npx prisma migrate reset --force
```

### Performance Issues

1. Check Neon's query monitoring in the Neon Dashboard
2. Verify indexes are being used: `EXPLAIN ANALYZE SELECT ...`
3. Check Sentry for slow transactions (if configured)
4. Review API response times in Vercel Analytics
