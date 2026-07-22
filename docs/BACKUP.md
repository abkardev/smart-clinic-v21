# Backup & Disaster Recovery

## Overview

SmartClinic stores persistent data in a PostgreSQL database (Neon in production) and
image assets in Vercel Blob Storage. This document covers backup, restore, and
disaster recovery procedures.

---

## Database Backup

### Prerequisites

- `psql` client installed
- `pg_dump` installed
- Database connection string (pooled URL for Neon)

### Manual Backup (pg_dump)

```bash
# Full backup (compressed)
pg_dump "$DATABASE_URL" \
  --no-owner \
  --no-acl \
  --format=custom \
  --file=smartclinic_$(date +%Y%m%d_%H%M%S).dump

# Plain SQL backup (portable, larger)
pg_dump "$DATABASE_URL" \
  --no-owner \
  --no-acl \
  --format=plain \
  --file=smartclinic_$(date +%Y%m%d_%H%M%S).sql
```

### Backup with pg_dumpall (cluster-wide)

```bash
pg_dumpall "$DATABASE_URL" \
  --file=cluster_$(date +%Y%m%d).sql
```

---

## Database Restore

### From Custom Format (recommended)

```bash
pg_restore \
  --dbname="$TARGET_DATABASE_URL" \
  --no-owner \
  --no-acl \
  --clean \
  --if-exists \
  smartclinic_20240101_120000.dump
```

### From Plain SQL

```bash
psql "$TARGET_DATABASE_URL" \
  --set ON_ERROR_STOP=on \
  --file=smartclinic_20240101_120000.sql
```

### Restore to Local Development

```bash
# Create the database
createdb smartclinic_restore

# Restore the dump
pg_restore \
  --dbname=postgresql://postgres:postgres@localhost:5432/smartclinic_restore \
  --no-owner \
  --no-acl \
  smartclinic_20240101_120000.dump

# Run migrations to catch any schema drift
npx prisma migrate deploy
```

---

## Neon Backup

Neon provides automatic backups (point-in-time recovery) for all plans.

### Point-in-Time Recovery (PITR)

1. Go to [Neon Console](https://console.neon.tech)
2. Select your project
3. Navigate to **Backups** tab
4. Select a restore point (time or LSN)
5. Click **Restore** to create a new branch at that point

### Export from Neon Branch

```bash
# Using pg_dump from a Neon branch
pg_dump "$NEON_BRANCH_URL" \
  --no-owner \
  --no-acl \
  --format=custom \
  --file=neon_export_$(date +%Y%m%d).dump
```

### Automated Backup Recommendation

Neon's built-in backups are sufficient for most cases. For additional safety:

```bash
#!/usr/bin/env bash
# save as scripts/backup.sh
# Schedule with cron: 0 3 * * * /path/to/scripts/backup.sh

set -euo pipefail

BACKUP_DIR="/var/backups/smartclinic"
RETENTION_DAYS=30
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DB_URL="${DATABASE_URL}"

mkdir -p "$BACKUP_DIR"

pg_dump "$DB_URL" \
  --no-owner \
  --no-acl \
  --format=custom \
  --file="${BACKUP_DIR}/smartclinic_${TIMESTAMP}.dump"

# Compress
gzip "${BACKUP_DIR}/smartclinic_${TIMESTAMP}.dump"

# Cleanup old backups
find "$BACKUP_DIR" -name "smartclinic_*.dump.gz" -mtime +${RETENTION_DAYS} -delete

echo "Backup complete: ${BACKUP_DIR}/smartclinic_${TIMESTAMP}.dump.gz"
```

### Cron Schedule

```
# Daily at 3:00 AM
0 3 * * * /usr/local/bin/smartclinic-backup.sh

# Weekly full backup (Sunday at 4:00 AM)
0 4 * * 0 /usr/local/bin/smartclinic-backup.sh --full
```

---

## Disaster Recovery Checklist

### Immediate Response (first 15 minutes)

1. **Assess impact**
   - Is the database accessible?
   - Is the application returning 5xx errors?
   - Are webhooks failing?

2. **Stop the bleeding**
   - If compromised: rotate all secrets (JWT_SECRET, API tokens)
   - If corrupted: stop write operations immediately
   - Notify users if PII may be exposed

3. **Engage backups**
   - Verify latest backup exists and is not corrupted
   - Check backup timestamp (RPO target)
   - Identify restore point

### Recovery (next 60 minutes)

1. **Provision recovery environment**
   - Create a new Neon branch or local database
   - Do NOT restore over the production database directly

2. **Restore from backup**
   ```bash
   pg_restore --dbname="$RECOVERY_URL" --no-owner --no-acl --clean --if-exists latest_backup.dump
   npx prisma migrate deploy
   ```

3. **Verify data integrity**
   - Check user accounts exist
   - Verify booking counts match expected
   - Test a booking flow against the recovery DB

4. **Switch over**
   - Update DATABASE_URL to point at the recovered database
   - Redeploy the application
   - Monitor error rates and response times

### Post-Mortem (next 24-48 hours)

1. Root cause analysis
2. Update RPO/RTO targets if needed
3. Improve backup frequency if gaps were found
4. Document lessons learned

---

## RPO and RTO Targets

| Tier     | RPO (Recovery Point Objective) | RTO (Recovery Time Objective) |
|----------|-------------------------------|-------------------------------|
| Current  | 24 hours                      | 2 hours                       |
| Target   | 1 hour                        | 30 minutes                    |

**Notes:**
- Current RPO depends on Neon's automatic backups (PITR)
- For 1-hour RPO, implement the cron backup script above
- For 30-minute RTO, ensure recovery database is pre-provisioned
- Testing the restore process quarterly is recommended

---

## Vercel Blob Storage

Images (offer media) are stored in Vercel Blob. These are not automatically backed up.

To manually back up:

```bash
# List blobs
curl -H "Authorization: Bearer $BLOB_READ_WRITE_TOKEN" \
  https://blob.vercel-storage.com/list

# Download individual blobs
curl -O -H "Authorization: Bearer $BLOB_READ_WRITE_TOKEN" \
  https://blob.vercel-storage.com/path/to/blob
```

---

## Testing the Backup

```bash
# 1. Create a test backup
pg_dump "$DATABASE_URL" --format=custom --file=test_backup.dump

# 2. Create a test database
createdb smartclinic_restore_test

# 3. Restore into it
pg_restore --dbname=postgresql://localhost:5432/smartclinic_restore_test \
  --no-owner --no-acl --clean --if-exists test_backup.dump

# 4. Verify
psql -d smartclinic_restore_test -c "SELECT count(*) FROM \"User\";"
psql -d smartclinic_restore_test -c "SELECT count(*) FROM \"Booking\";"

# 5. Clean up
dropdb smartclinic_restore_test
rm test_backup.dump
```
