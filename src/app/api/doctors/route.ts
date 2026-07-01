export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { getAuthUser } from '@/app/lib/auth';
import { logAudit, auditOptsFromRequest } from '@/app/lib/audit';

interface DoctorBody {
  nameEn: string; nameAr: string;
  specialtyEn?: string; specialtyAr?: string;
  phone?: string; email?: string; calendarId: string;
  workingStart?: string; workingEnd?: string;
  workingDays?: number[];
  workingHours?: { start?: string; end?: string };
  breakEnabled?: boolean; breakStart?: string; breakEnd?: string; breakDuration?: number;
  breakTime?: { enabled?: boolean; start?: string; end?: string; duration?: number };
  slotDuration?: number;
}

export async function GET() {
  try {
    const doctors = await prisma.doctor.findMany({
      where: { isActive: true },
      orderBy: { nameEn: 'asc' },
    });
    return NextResponse.json(doctors);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ message: 'Server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const { user, error } = await getAuthUser(req);
  if (error) return error;

  try {
    const body = await req.json() as DoctorBody;
    const doctor = await prisma.doctor.create({
      data: {
        nameEn: body.nameEn,
        nameAr: body.nameAr,
        specialtyEn: body.specialtyEn ?? null,
        specialtyAr: body.specialtyAr ?? null,
        phone: body.phone ?? null,
        email: body.email ?? null,
        calendarId: body.calendarId,
        workingStart: body.workingHours?.start ?? body.workingStart ?? '09:00',
        workingEnd: body.workingHours?.end ?? body.workingEnd ?? '17:00',
        workingDays: body.workingDays ?? [0, 1, 2, 3, 4],
        breakEnabled: body.breakTime?.enabled ?? body.breakEnabled ?? false,
        breakStart: body.breakTime?.start ?? body.breakStart ?? '13:00',
        breakEnd: body.breakTime?.end ?? body.breakEnd ?? '14:00',
        breakDuration: body.breakTime?.duration ?? body.breakDuration ?? 60,
        slotDuration: body.slotDuration ?? 30,
        isActive: true,
      },
    });

    await logAudit('CREATE_DOCTOR', 'Doctor', doctor.id,
      { nameEn: doctor.nameEn, nameAr: doctor.nameAr, specialtyEn: doctor.specialtyEn },
      auditOptsFromRequest(req, user!)
    );

    return NextResponse.json(doctor, { status: 201 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ message: 'Server error' }, { status: 500 });
  }
}
