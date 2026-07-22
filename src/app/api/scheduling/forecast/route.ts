import { NextRequest, NextResponse } from 'next/server';
import { forecastUtilization, forecastDemand, forecastWorkload } from '@/app/lib/schedulingEngine';
import { getAuthUser } from '@/app/lib/auth';
import { logger } from '@/app/lib/logger';

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type') ?? 'utilization';
  const doctorId = searchParams.get('doctorId') ?? undefined;
  const days = parseInt(searchParams.get('days') ?? '30', 10);

  try {
    let data;
    switch (type) {
      case 'demand':
        data = await forecastDemand(days);
        break;
      case 'workload':
        data = await forecastWorkload(days);
        break;
      case 'utilization':
      default:
        data = await forecastUtilization(doctorId, days);
    }
    return NextResponse.json({ type, forecasts: data });
  } catch (err) {
    logger.error('Forecasting error', { type, doctorId, days, error: String(err) });
    return NextResponse.json({ error: 'Failed to generate forecast' }, { status: 500 });
  }
}
