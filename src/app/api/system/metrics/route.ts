export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { metrics, getUptimeSeconds } from '@/app/lib/metrics';
import { logger } from '@/app/lib/logger';
import os from 'os';

function formatPrometheus(): string {
  const lines: string[] = [];
  const push = (name: string, help: string, type: string, value: number, labels?: string) => {
    lines.push(`# HELP smartclinic_${name} ${help}`);
    lines.push(`# TYPE smartclinic_${name} ${type}`);
    const lbl = labels ? `{${labels}}` : '';
    lines.push(`smartclinic_${name}${lbl} ${value}`);
  };

  const snapshot = metrics.snapshot() as Record<string, unknown>;

  for (const [key, val] of Object.entries(snapshot)) {
    if (typeof val === 'number') {
      push(key, `Counter: ${key}`, 'counter', val);
    } else if (val && typeof val === 'object' && !Array.isArray(val)) {
      const s = val as { count: number; sum: number; avg: number; max: number; distribution: Record<string, number> };
      if (typeof s.count === 'number') {
        push(`${key}_count`, `Histogram count: ${key}`, 'counter', s.count);
        push(`${key}_sum`, `Histogram sum: ${key}`, 'counter', s.sum);
        push(`${key}_avg`, `Histogram avg: ${key}`, 'gauge', s.avg);
        push(`${key}_max`, `Histogram max: ${key}`, 'gauge', s.max);
        if (s.distribution) {
          for (const [bucket, count] of Object.entries(s.distribution)) {
            lines.push(`smartclinic_${key}_bucket{le="${bucket.replace('le_', '')}"} ${count}`);
          }
        }
      }
    }
  }

  push('uptime_seconds', 'Process uptime', 'gauge', getUptimeSeconds());
  push('memory_used_mb', 'Memory RSS MB', 'gauge', Math.round(process.memoryUsage().rss / 1024 / 1024));
  push('cpu_usage_percent', 'CPU usage percent', 'gauge', os.loadavg()[0]);

  lines.push('# EOF');
  return lines.join('\n') + '\n';
}

export async function GET(req: NextRequest) {
  try {
    const output = formatPrometheus();
    return new NextResponse(output, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  } catch (err) {
    logger.error('Metrics endpoint error', { error: String(err) });
    return new NextResponse('# Error generating metrics\n', {
      status: 500,
      headers: { 'Content-Type': 'text/plain' },
    });
  }
}
