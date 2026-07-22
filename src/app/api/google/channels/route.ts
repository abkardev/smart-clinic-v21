import { NextResponse } from 'next/server';
import { renewChannels } from '@/app/lib/googleChannels';
import { logger } from '@/app/lib/logger';

export async function POST() {
  try {
    const result = await renewChannels();
    return NextResponse.json(result);
  } catch (err) {
    logger.error('Channel renewal failed', { error: String(err) });
    return NextResponse.json({ error: 'Renewal failed' }, { status: 500 });
  }
}

export async function GET() {
  const { getActiveChannels } = await import('@/app/lib/googleChannels');
  const count = await getActiveChannels();
  return NextResponse.json({ activeChannels: count });
}
