export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { getAuthUser, requireRole } from '@/app/lib/auth';
import { logAudit, auditOptsFromRequest } from '@/app/lib/audit';

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
        console.error('Google Calendar unblock sync failed:', (gErr as Error).message);
      }
    }

    await prisma.blockedSlot.delete({ where: { id: params.id } });
    await logAudit('UNBLOCK_SLOT', 'BlockedSlot', params.id, { doctorId: slot.doctorId }, auditOptsFromRequest(req, user!));

    return NextResponse.json({ message: 'Slot unblocked' });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ message: 'Server error' }, { status: 500 });
  }
}
