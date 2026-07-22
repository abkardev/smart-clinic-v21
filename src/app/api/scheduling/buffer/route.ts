import { NextRequest, NextResponse } from 'next/server';
import { getBufferForService, setBufferRule } from '@/app/lib/schedulingEngine';
import { getAuthUser } from '@/app/lib/auth';
import { logger } from '@/app/lib/logger';

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const doctorId = searchParams.get('doctorId');
  const service = searchParams.get('service');

  if (!doctorId || !service) {
    return NextResponse.json({ error: 'doctorId and service are required' }, { status: 400 });
  }

  try {
    const buffer = await getBufferForService(doctorId, service);
    return NextResponse.json(buffer);
  } catch (err) {
    logger.error('Buffer get error', { doctorId, service, error: String(err) });
    return NextResponse.json({ error: 'Failed to get buffer' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const { doctorId, service, bufferBefore, bufferAfter } = body;

    if (!doctorId || !service || bufferBefore === undefined || bufferAfter === undefined) {
      return NextResponse.json({ error: 'doctorId, service, bufferBefore, and bufferAfter are required' }, { status: 400 });
    }

    await setBufferRule(doctorId, service, bufferBefore, bufferAfter);
    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error('Buffer set error', { error: String(err) });
    return NextResponse.json({ error: 'Failed to set buffer' }, { status: 500 });
  }
}
