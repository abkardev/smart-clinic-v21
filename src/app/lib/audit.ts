import { Prisma, AuditStatus } from '@prisma/client';
import { prisma } from './prisma';

interface AuditOptions {
  userId?: string;
  userName?: string;
  userEmail?: string;
  ip?: string;
  userAgent?: string;
}

export async function logAudit(
  action: string,
  entity: string | null,
  entityId: string | null,
  details: Record<string, unknown> | null,
  opts: AuditOptions = {},
  status: AuditStatus = AuditStatus.success
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId:    opts.userId    ?? null,
        userName:  opts.userName  ?? null,
        userEmail: opts.userEmail ?? null,
        action,
        entity:    entity    ?? null,
        entityId:  entityId  ?? null,
        // Cast to Prisma.InputJsonValue — Prisma requires this for Json fields
        details: details !== null
          ? (details as unknown as Prisma.InputJsonValue)
          : Prisma.DbNull,
        ip:        opts.ip        ?? null,
        userAgent: opts.userAgent ?? null,
        status,
      },
    });
  } catch (err) {
    console.error('Audit log error:', err);
  }
}

export function auditOptsFromRequest(
  req: Request,
  user?: { id: string; name: string; email: string }
): AuditOptions {
  return {
    userId:    user?.id,
    userName:  user?.name,
    userEmail: user?.email,
    ip:        req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? undefined,
    userAgent: req.headers.get('user-agent') ?? undefined,
  };
}
