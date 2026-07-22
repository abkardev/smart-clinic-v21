import { NextRequest, NextResponse } from 'next/server';
import { getMultiDoctorAvailability } from '@/app/lib/schedulingEngine';
import { getAuthUser } from '@/app/lib/auth';
import { logger } from '@/app/lib/logger';

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const date = searchParams.get('date');
  const doctorIds = searchParams.get('doctorIds');

  if (!date || !doctorIds) {
    return NextResponse.json({ error: 'date and doctorIds are required' }, { status: 400 });
  }

  const ids = doctorIds.split(',').map((s) => s.trim()).filter(Boolean);

  if (ids.length < 2) {
    return NextResponse.json({ error: 'At least 2 doctorIds required' }, { status: 400 });
  }

  try {
    const result = await getMultiDoctorAvailability(ids, date);
    return NextResponse.json(result);
  } catch (err) {
    logger.error('Multi-doctor availability error', { date, doctorIds, error: String(err) });
    return NextResponse.json({ error: 'Failed to get multi-doctor availability' }, { status: 500 });
  }
}
