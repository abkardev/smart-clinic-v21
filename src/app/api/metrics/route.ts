import { NextRequest, NextResponse } from 'next/server';
import { metrics, getUptimeSeconds } from '@/app/lib/metrics';
import { getQuotaUsage } from '@/app/lib/quotaManager';
import { getChannelHealth } from '@/app/lib/channelScheduler';
import { getTokenHealth } from '@/app/lib/oauthLifecycle';
import { getDedupStats } from '@/app/lib/notificationDedup';

export async function GET(req: NextRequest) {
  const format = req.nextUrl.searchParams.get('format') ?? 'prometheus';

  const [channelHealth, tokenHealth, quota, dedupStats] = await Promise.all([
    getChannelHealth(),
    getTokenHealth(),
    Promise.resolve(getQuotaUsage()),
    getDedupStats(),
  ]);

  metrics.googleCalendarChannels.set(channelHealth.active);
  metrics.googleCalendarQuotaRemaining.set(Math.max(0, quota.dailyLimit - quota.dailyRequests));

  const snapshot = metrics.snapshot() as Record<string, unknown>;

  if (format === 'json') {
    return NextResponse.json({
      process: { uptimeSeconds: getUptimeSeconds() },
      channels: channelHealth,
      tokens: tokenHealth,
      quota,
      dedup: dedupStats,
      metrics: snapshot,
    });
  }

  const lines: string[] = [];
  const uptime = getUptimeSeconds();

  lines.push('# HELP google_calendar_uptime_seconds Process uptime');
  lines.push('# TYPE google_calendar_uptime_seconds gauge');
  lines.push(`google_calendar_uptime_seconds ${uptime}`);

  const pushMetric = (name: string, help: string, value: number | string, type = 'gauge', labels?: string) => {
    lines.push(`# HELP ${name} ${help}`);
    lines.push(`# TYPE ${name} ${type}`);
    const labelStr = labels ? `{${labels}}` : '';
    lines.push(`${name}${labelStr} ${value}`);
  };

  pushMetric('google_calendar_requests_total', 'Total Google Calendar API requests', snapshot.googleCalendarRequestsTotal as number, 'counter');
  pushMetric('google_calendar_failures_total', 'Total Google Calendar API failures', snapshot.googleCalendarFailuresTotal as number, 'counter');
  pushMetric('google_calendar_retries', 'Total Google Calendar retries', snapshot.googleCalendarRetries as number, 'counter');
  pushMetric('google_calendar_notifications', 'Total webhook notifications received', snapshot.googleCalendarNotifications as number, 'counter');
  pushMetric('google_calendar_oauth_refreshes', 'Total OAuth token refreshes', snapshot.googleCalendarOAuthRefreshes as number, 'counter');

  pushMetric('google_calendar_channels_active', 'Active watch channels', channelHealth.active, 'gauge');
  pushMetric('google_calendar_channels_expiring', 'Expiring channels (<24h)', channelHealth.expiring, 'gauge');
  pushMetric('google_calendar_channels_expired', 'Expired channels', channelHealth.expired, 'gauge');
  pushMetric('google_calendar_channels_errored', 'Errored channels', channelHealth.errored, 'gauge');

  pushMetric('google_calendar_quota_remaining', 'Remaining daily quota', Math.max(0, quota.dailyLimit - quota.dailyRequests), 'gauge');
  pushMetric('google_calendar_quota_usage_percent', 'Daily quota usage %', quota.usagePercent, 'gauge');
  pushMetric('google_calendar_quota_daily_requests', 'Daily request count', quota.dailyRequests, 'counter');

  pushMetric('google_calendar_tokens_active', 'Active OAuth tokens', tokenHealth.active, 'gauge');
  pushMetric('google_calendar_tokens_expiring', 'Expiring OAuth tokens', tokenHealth.expiring, 'gauge');
  pushMetric('google_calendar_tokens_expired', 'Expired OAuth tokens', tokenHealth.expired, 'gauge');
  pushMetric('google_calendar_tokens_revoked', 'Revoked OAuth tokens', tokenHealth.revoked, 'gauge');

  pushMetric('google_calendar_dedup_entries', 'Processed notification cache size', dedupStats.total, 'gauge');

  const syncLatency = snapshot.googleCalendarSyncDuration as { count: number; avg: number; max: number };
  if (syncLatency) {
    pushMetric('google_calendar_sync_duration_count', 'Sync operation count', syncLatency.count, 'counter');
    pushMetric('google_calendar_sync_duration_avg_ms', 'Average sync duration ms', syncLatency.avg, 'gauge');
    pushMetric('google_calendar_sync_duration_max_ms', 'Max sync duration ms', syncLatency.max, 'gauge');
  }

  const requestLatency = snapshot.googleCalendarLatency as { count: number; avg: number; max: number };
  if (requestLatency) {
    pushMetric('google_calendar_request_latency_count', 'Request count', requestLatency.count, 'counter');
    pushMetric('google_calendar_request_latency_avg_ms', 'Average request latency ms', requestLatency.avg, 'gauge');
    pushMetric('google_calendar_request_latency_max_ms', 'Max request latency ms', requestLatency.max, 'gauge');
  }

  return new NextResponse(lines.join('\n') + '\n', {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
