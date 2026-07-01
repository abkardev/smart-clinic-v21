export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { prisma } from '@/app/lib/prisma';
import { hashPassword } from '@/app/lib/auth';
import { checkRateLimit } from '@/app/lib/rateLimit';

export async function POST(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const rl = checkRateLimit(`reset-password:${ip}`, 5, 60 * 60 * 1000);
    if (!rl.allowed) {
      return NextResponse.json({ message: 'Too many attempts. Please try again later.', messageAr: 'محاولات كثيرة. يرجى المحاولة لاحقاً.' }, { status: 429 });
    }

    const hashed = crypto.createHash('sha256').update(params.token).digest('hex');

    const user = await prisma.user.findFirst({
      where: {
        resetPasswordToken: hashed,
        resetPasswordExpires: { gt: new Date() },
      },
    });

    if (!user) {
      return NextResponse.json({ message: 'Token is invalid or expired' }, { status: 400 });
    }

    const { password } = await req.json() as { password: string };
    if (!password || password.length < 6) {
      return NextResponse.json({ message: 'Password must be at least 6 characters' }, { status: 400 });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: await hashPassword(password),
        resetPasswordToken: null,
        resetPasswordExpires: null,
      },
    });

    return NextResponse.json({ message: 'Password reset successful.' });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ message: 'Server error' }, { status: 500 });
  }
}
