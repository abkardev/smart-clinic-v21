export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { getAuthUser, requireRole } from '@/app/lib/auth';
import { logAudit, auditOptsFromRequest, AuditAction } from '@/app/lib/audit';
import { logger } from '@/app/lib/logger';

// DELETE /api/blocked-slots/[id]
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { user, error } = await getAuthUser(req);
  if (error) return error;
  const roleError = requireRole(user!, 'superadmin', 'admin', 'doctor');
  if (roleError) return roleError;

  try {
    const slot = await prisma.blockedSlot.findUnique({
      where: { id: params.id },
      include: { doctor: true },
    });
    if (!slot) return NextResponse.json({ message: 'Blocked slot not found' }, { status: 404 });

    if (user!.role === 'doctor' && user!.doctorId !== slot.doctorId) {
      return NextResponse.json({ message: 'Can only unblock your own slots' }, { status: 403 });
    }

    // Remove from Google Calendar if synced
    if (slot.syncedToGoogle && slot.googleEventId && slot.doctor) {
      try {
        const { google } = await import('@/app/lib/google');
        await google.events.delete({
          calendarId: slot.doctor.calendarId,
          eventId: slot.googleEventId,
        });
      } catch (gErr) {
        logger.error('Google Calendar unblock sync failed', { error: String(gErr) });
      }
    }

    await prisma.blockedSlot.delete({ where: { id: params.id } });
    await logAudit(AuditAction.SLOT_UNBLOCKED, 'BlockedSlot', params.id, { doctorId: slot.doctorId }, auditOptsFromRequest(req, user!));

    return NextResponse.json({ message: 'Slot unblocked' });
  } catch (err) {
    logger.error('Failed to unblock slot', { error: String(err), slotId: params.id });
    return NextResponse.json({ message: 'Server error' }, { status: 500 });
  }
}
