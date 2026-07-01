export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { getAuthUser, requireRole } from '@/app/lib/auth';
import { logAudit, auditOptsFromRequest } from '@/app/lib/audit';

// DELETE /api/holidays/[id]
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { user, error } = await getAuthUser(req);
  if (error) return error;
  const roleError = requireRole(user!, 'superadmin', 'admin');
  if (roleError) return roleError;

  try {
    await prisma.holiday.delete({ where: { id: params.id } });
    await logAudit('DELETE_HOLIDAY', 'Holiday', params.id, null, auditOptsFromRequest(req, user!));
    return NextResponse.json({ message: 'Holiday deleted' });
  } catch (err: unknown) {
    const e = err as { code?: string };
    if (e.code === 'P2025') return NextResponse.json({ message: 'Holiday not found' }, { status: 404 });
    return NextResponse.json({ message: 'Server error' }, { status: 500 });
  }
}
