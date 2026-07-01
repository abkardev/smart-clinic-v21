export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { getAuthUser, requireRole } from '@/app/lib/auth';
import { logAudit, auditOptsFromRequest } from '@/app/lib/audit';

// DELETE /api/auth/users/[id]
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { user, error } = await getAuthUser(req);
  if (error) return error;
  const roleError = requireRole(user!, 'superadmin', 'admin');
  if (roleError) return roleError;

  try {
    const target = await prisma.user.findUnique({ where: { id: params.id } });
    if (!target) return NextResponse.json({ message: 'User not found' }, { status: 404 });

    await prisma.user.delete({ where: { id: params.id } });
    await logAudit('DELETE_USER', 'User', params.id, { targetUser: target.email }, auditOptsFromRequest(req, user!));

    return NextResponse.json({ message: 'User deleted' });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ message: 'Server error' }, { status: 500 });
  }
}
