export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { getAuthUser } from '@/app/lib/auth';
import { logAudit, auditOptsFromRequest, AuditAction } from '@/app/lib/audit';
import { logger } from '@/app/lib/logger';

interface DoctorBody {
  nameEn?: string; nameAr?: string;
  specialtyEn?: string; specialtyAr?: string;
  phone?: string; email?: string; calendarId?: string;
  workingStart?: string; workingEnd?: string;
  workingDays?: number[];
  workingHours?: { start?: string; end?: string };
  breakEnabled?: boolean; breakStart?: string; breakEnd?: string; breakDuration?: number;
  breakTime?: { enabled?: boolean; start?: string; end?: string; duration?: number };
  slotDuration?: number; isActive?: boolean;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const doctor = await prisma.doctor.findUnique({ where: { id: params.id } });
    if (!doctor) return NextResponse.json({ message: 'Doctor not found' }, { status: 404 });
    return NextResponse.json(doctor);
  } catch (err) {
    logger.error('Failed to fetch doctor', { error: String(err), doctorId: params.id });
    return NextResponse.json({ message: 'Server error' }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { user, error } = await getAuthUser(req);
  if (error) return error;
  const roleError = requireRole(user!, 'superadmin', 'admin');
  if (roleError) return roleError;

  try {
    // Capture before state for audit diff
    const before = await prisma.doctor.findUnique({ where: { id: params.id } });
    const body = await req.json() as DoctorBody;

    const doctor = await prisma.doctor.update({
      where: { id: params.id },
      data: {
        nameEn:       body.nameEn,
        nameAr:       body.nameAr,
        specialtyEn:  body.specialtyEn ?? null,
        specialtyAr:  body.specialtyAr ?? null,
        phone:        body.phone ?? null,
        email:        body.email ?? null,
        calendarId:   body.calendarId,
        workingStart: body.workingHours?.start ?? body.workingStart,
        workingEnd:   body.workingHours?.end   ?? body.workingEnd,
        workingDays:  body.workingDays,
        breakEnabled: body.breakTime?.enabled  ?? body.breakEnabled,
        breakStart:   body.breakTime?.start    ?? body.breakStart,
        breakEnd:     body.breakTime?.end      ?? body.breakEnd,
        breakDuration:body.breakTime?.duration ?? body.breakDuration,
        slotDuration: body.slotDuration,
        isActive:     body.isActive,
      },
    });

    // Build diff — only log changed fields
    const changed: Record<string, { before: unknown; after: unknown }> = {};
    const fields = ['nameEn','nameAr','specialtyEn','specialtyAr','phone','email',
                    'workingStart','workingEnd','slotDuration','isActive'] as const;
    for (const f of fields) {
      if (before && doctor[f] !== before[f]) {
        changed[f] = { before: before[f], after: doctor[f] };
      }
    }

    await logAudit(AuditAction.DOCTOR_UPDATED, 'Doctor', doctor.id,
      { nameEn: doctor.nameEn, changes: changed },
      auditOptsFromRequest(req, user!)
    );

    return NextResponse.json(doctor);
  } catch (err: unknown) {
    const e = err as { code?: string; message?: string };
    if (e.code === 'P2025') return NextResponse.json({ message: 'Doctor not found' }, { status: 404 });
    return NextResponse.json({ message: e.message ?? 'Server error' }, { status: 400 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { user, error } = await getAuthUser(req);
  if (error) return error;
  const roleError = requireRole(user!, 'superadmin', 'admin');
  if (roleError) return roleError;

  try {
    const before = await prisma.doctor.findUnique({ where: { id: params.id } });
    await prisma.doctor.update({ where: { id: params.id }, data: { isActive: false } });

    await logAudit(AuditAction.DOCTOR_DEACTIVATED, 'Doctor', params.id,
      { nameEn: before?.nameEn, nameAr: before?.nameAr },
      auditOptsFromRequest(req, user!)
    );

    return NextResponse.json({ message: 'Doctor deactivated' });
  } catch (err) {
    logger.error('Failed to deactivate doctor', { error: String(err), doctorId: params.id });
    return NextResponse.json({ message: 'Server error' }, { status: 500 });
  }
}
