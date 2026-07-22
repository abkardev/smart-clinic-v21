import { NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { expandRecurringSlots } from '@/app/lib/recurringEvents';
import { logger } from '@/app/lib/logger';

export async function POST() {
  try {
    const doctors = await prisma.doctor.findMany({ where: { isActive: true } });
    let total = 0;

    for (const doctor of doctors) {
      const expanded = await expandRecurringSlots(doctor.id);
      total += expanded;
    }

    logger.info('Recurring slots expansion completed', { doctorsScanned: doctors.length, totalExpanded: total });
    return NextResponse.json({ expanded: total, doctorsScanned: doctors.length });
  } catch (err) {
    logger.error('Recurring slot expansion failed', { error: String(err) });
    return NextResponse.json({ error: 'Expansion failed' }, { status: 500 });
  }
}
