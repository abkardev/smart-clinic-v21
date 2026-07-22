#!/bin/sh
# SmartClinic Calendar Retry Scheduler — Docker cron runner
# Runs every minute via supercronic or host cron.
# Usage:
#   docker-cron.sh              # uses http://localhost:3000
#   DOCKER_HOST=http://app:3000 docker-cron.sh
#
# Environment variables:
#   CALENDAR_INTERNAL_SECRET  (required)
#   DOCKER_HOST               (default: http://localhost:3000)

set -e

HOST="${DOCKER_HOST:-http://localhost:3000}"
SECRET="${CALENDAR_INTERNAL_SECRET:-}"

if [ -z "$SECRET" ]; then
  echo "ERROR: CALENDAR_INTERNAL_SECRET is not set" >&2
  exit 1
fi

curl -s -o /dev/null -w "%{http_code}" \
  -X POST "${HOST}/api/internal/calendar/retry" \
  -H "Authorization: Bearer ${SECRET}" \
  -H "Content-Type: application/json" \
  --max-time 30
