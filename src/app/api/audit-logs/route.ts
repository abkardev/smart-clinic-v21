export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { getAuthUser, requireRole } from '@/app/lib/auth';

// GET /api/audit-logs
export async function GET(req: NextRequest) {
  const { user, error } = await getAuthUser(req);
  if (error) return error;
  const roleError = requireRole(user!, 'superadmin', 'admin');
  if (roleError) return roleError;

  try {
    const { searchParams } = new URL(req.url);
    const userId    = searchParams.get('userId');
    const action    = searchParams.get('action');
    const entity    = searchParams.get('entity');
    const startDate = searchParams.get('startDate');
    const endDate   = searchParams.get('endDate');
    const page      = parseInt(searchParams.get('page') ?? '1');
    const limit     = parseInt(searchParams.get('limit') ?? '50');

    const where: Record<string, unknown> = {};
    if (userId) where.userId = userId;
    if (entity) where.entity = entity;
    if (action) where.action = { contains: action, mode: 'insensitive' };
    if (startDate || endDate) {
      const createdAt: Record<string, Date> = {};
      if (startDate) createdAt.gte = new Date(startDate);
      if (endDate)   createdAt.lte = new Date(endDate + 'T23:59:59');
      where.createdAt = createdAt;
    }

    const skip = (page - 1) * limit;

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        include: { user: { select: { name: true, email: true, role: true } } },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.auditLog.count({ where }),
    ]);

    return NextResponse.json({
      logs,
      total,
      page,
      pages: Math.ceil(total / limit),
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ message: 'Server error' }, { status: 500 });
  }
}
