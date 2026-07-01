export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { getAuthUser, requireRole } from '@/app/lib/auth';
import { logAudit, auditOptsFromRequest } from '@/app/lib/audit';
import { UserStatus } from '@prisma/client';

// PATCH /api/auth/users/[id]/status
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { user, error } = await getAuthUser(req);
  if (error) return error;
  const roleError = requireRole(user!, 'superadmin', 'admin');
  if (roleError) return roleError;

  try {
    const { status } = await req.json() as { status: UserStatus };
    const target = await prisma.user.findUnique({ where: { id: params.id } });
    if (!target) return NextResponse.json({ message: 'User not found' }, { status: 404 });

    if (target.role === 'superadmin' && user!.role !== 'superadmin') {
      return NextResponse.json({ message: 'Cannot modify superadmin' }, { status: 403 });
    }

    const updated = await prisma.user.update({
      where: { id: params.id },
      data: {
        status,
        ...(status === 'approved' ? { approvedById: user!.id, approvedAt: new Date() } : {}),
      },
      select: {
        id: true, name: true, email: true, role: true, status: true,
        preferredLang: true, lastLogin: true, approvedAt: true, createdAt: true, updatedAt: true,
      },
    });

    await logAudit(
      'UPDATE_USER_STATUS', 'User', params.id,
      { status, targetUser: target.email },
      auditOptsFromRequest(req, user!)
    );

    return NextResponse.json({ message: `User ${status}`, user: updated });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ message: 'Server error' }, { status: 500 });
  }
}
