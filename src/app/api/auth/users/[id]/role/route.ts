export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { getAuthUser, requireRole } from '@/app/lib/auth';
import { logAudit, auditOptsFromRequest } from '@/app/lib/audit';
import { UserRole } from '@prisma/client';

// PATCH /api/auth/users/[id]/role
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { user, error } = await getAuthUser(req);
  if (error) return error;
  const roleError = requireRole(user!, 'superadmin', 'admin');
  if (roleError) return roleError;

  try {
    const { role } = await req.json() as { role: UserRole };
    const validRoles: UserRole[] = ['superadmin', 'admin', 'doctor'];
    if (!validRoles.includes(role)) {
      return NextResponse.json({ message: 'Invalid role' }, { status: 400 });
    }

    const target = await prisma.user.findUnique({ where: { id: params.id } });
    if (!target) return NextResponse.json({ message: 'User not found' }, { status: 404 });

    if ((role === 'superadmin' || target.role === 'superadmin') && user!.role !== 'superadmin') {
      return NextResponse.json({ message: 'Only superadmin can manage superadmin roles' }, { status: 403 });
    }

    const updated = await prisma.user.update({
      where: { id: params.id },
      data: { role },
      select: {
        id: true, name: true, email: true, role: true, status: true,
        preferredLang: true, lastLogin: true, createdAt: true, updatedAt: true,
      },
    });

    await logAudit(
      'UPDATE_USER_ROLE', 'User', params.id,
      { newRole: role, oldRole: target.role, targetUser: target.email },
      auditOptsFromRequest(req, user!)
    );

    return NextResponse.json(updated);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ message: 'Server error' }, { status: 500 });
  }
}
