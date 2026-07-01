export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { getAuthUser, requireRole } from '@/app/lib/auth';
import { logAudit, auditOptsFromRequest } from '@/app/lib/audit';
import type { HolidayType } from '@prisma/client';

interface HolidayBody {
  type: HolidayType;
  dayOfWeek?: number;
  date?: string;
  nameEn?: string;
  nameAr?: string;
  applyToAll?: boolean;
  doctorIds?: string[];
}

export async function GET() {
  try {
    const holidays = await prisma.holiday.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        createdBy: { select: { name: true } },
        doctors: { include: { doctor: { select: { id: true, nameEn: true, nameAr: true } } } },
      },
    });
    const shaped = holidays.map(({ doctors, ...h }) => ({
      ...h,
      doctorIds: doctors.map((hd) => hd.doctorId),
    }));
    return NextResponse.json(shaped);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ message: 'Server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const { user, error } = await getAuthUser(req);
  if (error) return error;
  const roleError = requireRole(user!, 'superadmin', 'admin');
  if (roleError) return roleError;

  try {
    const body = await req.json() as HolidayBody;
    const { type, dayOfWeek, date, nameEn, nameAr, applyToAll, doctorIds } = body;

    const holiday = await prisma.holiday.create({
      data: {
        type,
        dayOfWeek: dayOfWeek ?? null,
        date: date ?? null,
        nameEn: nameEn ?? '',
        nameAr: nameAr ?? '',
        applyToAll: applyToAll ?? true,
        createdById: user!.id,
        doctors: !applyToAll && doctorIds?.length
          ? { create: doctorIds.map((id) => ({ doctorId: id })) }
          : undefined,
      },
    });

    await logAudit('CREATE_HOLIDAY', 'Holiday', holiday.id, { type }, auditOptsFromRequest(req, user!));
    return NextResponse.json(holiday, { status: 201 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ message: 'Server error' }, { status: 500 });
  }
}
