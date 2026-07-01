export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { getAvailableSlots } from '@/app/lib/availability';
import { apiResponse } from '@/app/lib/apiResponse';

// GET /api/bookings/available-slots?doctorId=...&date=...
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const doctorId = searchParams.get('doctorId');
    const date = searchParams.get('date');

    if (!doctorId || !date) {
      return NextResponse.json({ message: 'doctorId and date are required' }, { status: 400 });
    }

    const doctor = await prisma.doctor.findUnique({ where: { id: doctorId } });
    if (!doctor) return NextResponse.json({ message: 'Doctor not found' }, { status: 404 });

    const result = await getAvailableSlots(doctor, date);
    return apiResponse(result);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ message: 'Server error' }, { status: 500 });
  }
}
