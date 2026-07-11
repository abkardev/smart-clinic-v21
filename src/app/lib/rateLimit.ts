import { prisma } from './prisma';

export async function checkRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number
): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  try {
    const now = Date.now();
    const existing = await prisma.rateLimit.findUnique({ where: { key } });

    if (!existing || existing.expiresAt.getTime() < now) {
      await prisma.rateLimit.upsert({
        where: { key },
        create: { key, count: 1, expiresAt: new Date(now + windowMs) },
        update: { count: 1, expiresAt: new Date(now + windowMs) },
      });
      return { allowed: true, remaining: maxRequests - 1, resetAt: now + windowMs };
    }

    if (existing.count >= maxRequests) {
      return { allowed: false, remaining: 0, resetAt: existing.expiresAt.getTime() };
    }

    await prisma.rateLimit.update({
      where: { key },
      data: { count: { increment: 1 } },
    });

    return { allowed: true, remaining: maxRequests - (existing.count + 1), resetAt: existing.expiresAt.getTime() };
  } catch {
    return { allowed: true, remaining: maxRequests, resetAt: Date.now() + windowMs };
  }
}
