export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { getAuthUser, requireRole } from '@/app/lib/auth';
import { logAudit, auditOptsFromRequest, AuditAction } from '@/app/lib/audit';
import { logger } from '@/app/lib/logger';

// DELETE /api/auth/users/[id]
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, error } = await getAuthUser(req);
  if (error) return error;
  const roleError = requireRole(user!, 'superadmin');
  if (roleError) return roleError;

  const { id } = await params;

  try {
    const target = await prisma.user.findUnique({ where: { id }, select: { email: true } });
    if (!target) return NextResponse.json({ message: 'User not found' }, { status: 404 });

    await prisma.user.delete({ where: { id } });
    await logAudit(AuditAction.USER_DELETED, 'User', id, { targetUser: target.email }, auditOptsFromRequest(req, user!));

    return NextResponse.json({ message: 'User deleted' });
  } catch (err) {
    logger.error('Failed to delete user', { error: String(err), userId: id });
    return NextResponse.json({ message: 'Server error' }, { status: 500 });
  }
}
