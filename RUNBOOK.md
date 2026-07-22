# SmartClinic Runbook

## Deployment

### Vercel (Standard)

```bash
# Install dependencies
npm ci

# Generate Prisma client
npx prisma generate

# Run database migrations
npx prisma migrate deploy

# Build
npm run build

# Deploy via Vercel CLI
vercel --prod
```

### Self-hosted (Docker)

```bash
# Build image
docker build -t smartclinic:latest .

# Run
docker run -d \
  --name smartclinic \
  -p 3000:3000 \
  --env-file .env.production \
  smartclinic:latest
```

## Rollback

### Vercel
```bash
# Rollback to previous deployment
vercel rollback

# Or via Vercel Dashboard → Deployments → ⋮ → Rollback
```

### Docker
```bash
# Rollback to previous image tag
docker stop smartclinic
docker run -d --name smartclinic \
  -p 3000:3000 \
  --env-file .env.production \
  smartclinic:previous-tag

# Remove failed container
docker rm smartclinic-old
```

## Database Migrations

### Apply
```bash
npx prisma migrate deploy
```

### Reset (destructive)
```bash
npx prisma migrate reset --force
```

### Seed
```bash
npx prisma db seed
```

## Monitoring

### Check health
```bash
curl https://app.com/api/health
curl https://app.com/api/system/dashboard -H "Authorization: Bearer $TOKEN"
```

### Check Prometheus metrics
```bash
curl https://app.com/api/system/metrics
```

### Run cleanup manually
```bash
curl -X POST https://app.com/api/system/cleanup -H "Authorization: Bearer $TOKEN"
```

### Trigger retry worker
```bash
curl -X POST https://app.com/api/internal/calendar/retry \
  -H "Authorization: Bearer $CALENDAR_INTERNAL_SECRET"
```

## Configuration Validation

On startup, the system validates:
- Required env vars (`DATABASE_URL`, `JWT_SECRET`)
- Google Calendar credentials
- WhatsApp configuration
- Instagram configuration
- Scheduler configuration
- Sentry DSN

Warnings are logged for missing optional configuration. Missing required configuration causes startup failure.

## Tests

```bash
# Unit + integration tests
npm test

# With coverage
npm run test:coverage

# E2E tests
npm run test:e2e
```
