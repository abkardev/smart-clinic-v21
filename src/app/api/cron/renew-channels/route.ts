import { NextResponse } from 'next/server';
import { renewExpiringChannels, cleanupObsoleteChannels, deduplicateChannels } from '@/app/lib/channelScheduler';
import { logger } from '@/app/lib/logger';

export async function POST() {
  try {
    const [renewal, dedup, cleanup] = await Promise.all([
      renewExpiringChannels(),
      deduplicateChannels(),
      cleanupObsoleteChannels(),
    ]);

    logger.info('Channel maintenance completed', { renewal, dedup, cleanup });
    return NextResponse.json({ renewal, dedup, cleanup });
  } catch (err) {
    logger.error('Channel renewal cron failed', { error: String(err) });
    return NextResponse.json({ error: 'Maintenance failed' }, { status: 500 });
  }
}
