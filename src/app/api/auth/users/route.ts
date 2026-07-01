export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { getAuthUser, requireRole } from '@/app/lib/auth';

// GET /api/auth/users  — list users (admin+)
export async function GET(req: NextRequest) {
  const { user, error } = await getAuthUser(req);
  if (error) return error;
  const roleError = requireRole(user!, 'superadmin', 'admin');
  if (roleError) return roleError;

  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');
  const role = searchParams.get('role');

  const where: Record<string, unknown> = {};
  if (status) where.status = status;
  if (role) where.role = role;

  const users = await prisma.user.findMany({
    where,
    select: {
      id: true, name: true, email: true, role: true, status: true,
      preferredLang: true, lastLogin: true, approvedAt: true,
      createdAt: true, updatedAt: true, doctorId: true,
      approvedBy: { select: { name: true, email: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json(users);
}
