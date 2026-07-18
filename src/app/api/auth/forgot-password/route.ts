export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { prisma } from '@/app/lib/prisma';
import { checkRateLimit } from '@/app/lib/rateLimit';
import { optional } from '@/app/lib/env';
import { sendPasswordResetEmail } from '@/app/lib/email';
import { logger } from '@/app/lib/logger';

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const rl = await checkRateLimit(`forgot-password:${ip}`, 3, 60 * 60 * 1000);
    if (!rl.allowed) {
      return NextResponse.json({ message: 'Too many requests. Please try again later.', messageAr: 'طلبات كثيرة. يرجى المحاولة لاحقاً.' }, { status: 429 });
    }

    const { email } = await req.json() as { email: string };
    const user = email
      ? await prisma.user.findUnique({ where: { email: email.toLowerCase() } })
      : null;

    if (user) {
      const token = crypto.randomBytes(32).toString('hex');
      const hashed = crypto.createHash('sha256').update(token).digest('hex');

      await prisma.user.update({
        where: { id: user.id },
        data: {
          resetPasswordToken: hashed,
          resetPasswordExpires: new Date(Date.now() + 60 * 60 * 1000),
        },
      });

      await sendPasswordResetEmail(user.email, user.name, token, user.preferredLang);
    }

    return NextResponse.json({ message: 'If an account with that email exists, a password reset link has been sent.' });
  } catch (err) {
    logger.error('[ForgotPassword] Failed to process request', { error: String(err) });
    return NextResponse.json({ message: 'Server error' }, { status: 500 });
  }
}
