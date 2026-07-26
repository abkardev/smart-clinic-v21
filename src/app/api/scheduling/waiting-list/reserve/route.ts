import { NextRequest, NextResponse } from 'next/server';
import { reserveSlot } from '@/app/lib/schedulingEngine';
import { getAuthUser } from '@/app/lib/auth';
import { logger } from '@/app/lib/logger';

export async function POST(req: NextRequest) {
  const { error } = await getAuthUser(req);
  if (error) return error;

  try {
    const body = await req.json();
    const { entryId, date, time } = body;

    if (!entryId || !date || !time) {
      return NextResponse.json({ error: 'entryId, date, and time are required' }, { status: 400 });
    }

    const success = await reserveSlot(entryId, date, time);
    if (!success) {
      return NextResponse.json({ error: 'Entry not found or already reserved' }, { status: 409 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error('Waiting list reserve error', { error: String(err) });
    return NextResponse.json({ error: 'Failed to reserve slot' }, { status: 500 });
  }
}
