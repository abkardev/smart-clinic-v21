import { NextRequest, NextResponse } from 'next/server';
import { addToWaitingList, findBestCandidate } from '@/app/lib/schedulingEngine';
import { getAuthUser } from '@/app/lib/auth';
import { logger } from '@/app/lib/logger';

export async function POST(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const { name, phone, service, doctorId, priority, preferredDays, preferredTimes, notes } = body;

    if (!name || !phone || !service) {
      return NextResponse.json({ error: 'name, phone, and service are required' }, { status: 400 });
    }

    const result = await addToWaitingList({ name, phone, service, doctorId, priority, preferredDays, preferredTimes, notes });
    return NextResponse.json({ success: true, ...result }, { status: 201 });
  } catch (err) {
    logger.error('Waiting list add error', { error: String(err) });
    return NextResponse.json({ error: 'Failed to add to waiting list' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const doctorId = searchParams.get('doctorId');
  const date = searchParams.get('date');
  const time = searchParams.get('time');
  const service = searchParams.get('service');

  if (!doctorId || !date || !time || !service) {
    return NextResponse.json({ error: 'doctorId, date, time, and service are required' }, { status: 400 });
  }

  try {
    const candidate = await findBestCandidate(doctorId, date, time, service);
    return NextResponse.json({ candidate });
  } catch (err) {
    logger.error('Waiting list find error', { doctorId, date, time, service, error: String(err) });
    return NextResponse.json({ error: 'Failed to find candidate' }, { status: 500 });
  }
}
