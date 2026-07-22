import { NextResponse } from 'next/server';
import { generateReconciliationReport } from '@/app/lib/driftMonitor';
import { logger } from '@/app/lib/logger';

export async function POST() {
  try {
    const report = await generateReconciliationReport();
    return NextResponse.json({
      timestamp: report.timestamp,
      doctorsScanned: report.doctorsScanned,
      healthy: report.healthy,
      degraded: report.degraded,
      unhealthy: report.unhealthy,
      totalMissing: report.totalMissing,
      totalOrphan: report.totalOrphan,
      totalModified: report.totalModified,
    });
  } catch (err) {
    logger.error('Drift check cron failed', { error: String(err) });
    return NextResponse.json({ error: 'Drift check failed' }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    endpoint: 'Nightly calendar drift verification',
    usage: 'POST to run drift check across all doctors',
    description: 'Compares booking vs Google event counts, detects missing/orphan/modified events',
  });
}
