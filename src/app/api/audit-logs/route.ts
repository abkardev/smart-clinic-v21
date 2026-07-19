export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { getAuthUser, requireRole } from '@/app/lib/auth';
import { logger } from '@/app/lib/logger';

const MAX_LIMIT = 200;

export async function GET(req: NextRequest) {
  const { user, error } = await getAuthUser(req);
  if (error) return error;
  const roleError = requireRole(user!, 'superadmin');
  if (roleError) return roleError;

  try {
    const { searchParams } = new URL(req.url);
    const userId        = searchParams.get('userId');
    const action        = searchParams.get('action');
    const category      = searchParams.get('category');
    const severity      = searchParams.get('severity');
    const entity        = searchParams.get('entity');
    const entityId      = searchParams.get('entityId');
    const correlationId = searchParams.get('correlationId');
    const status        = searchParams.get('status');
    const startDate     = searchParams.get('startDate');
    const endDate       = searchParams.get('endDate');
    let page            = parseInt(searchParams.get('page') ?? '1');
    let limit           = parseInt(searchParams.get('limit') ?? '50');

    if (page < 1) page = 1;
    if (limit < 1) limit = 50;
    if (limit > MAX_LIMIT) limit = MAX_LIMIT;

    const where: Record<string, unknown> = {};
    if (userId) where.userId = userId;
    if (action) where.action = { contains: action, mode: 'insensitive' };
    if (category) where.category = category;
    if (severity) where.severity = severity;
    if (entity) where.entity = entity;
    if (entityId) where.entityId = entityId;
    if (correlationId) where.correlationId = correlationId;
    if (status) where.status = status;
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
    logger.error('Failed to fetch audit logs', { error: String(err) });
    return NextResponse.json({ message: 'Server error' }, { status: 500 });
  }
}
