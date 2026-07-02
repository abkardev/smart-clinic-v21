export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { signToken, comparePassword } from '@/app/lib/auth';
import { logAudit } from '@/app/lib/audit';
import { checkRateLimit } from '@/app/lib/rateLimit';

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const rl = checkRateLimit(`login:${ip}`, 10, 15 * 60 * 1000);
    if (!rl.allowed) {
      return NextResponse.json({ message: 'Too many login attempts. Please try again later.', messageAr: 'محاولات تسجيل دخول كثيرة. يرجى المحاولة لاحقاً.' }, { status: 429 });
    }

    const { email, password } = await req.json() as { email: string; password: string };

    const user = await prisma.user.findUnique({ where: { email: email?.toLowerCase() } });

    if (!user || !(await comparePassword(password, user.password))) {
      return NextResponse.json(
        { message: 'Invalid email or password', messageAr: 'البريد الإلكتروني أو كلمة المرور غير صحيحة' },
        { status: 401 }
      );
    }

    if (user.status === 'pending') {
      return NextResponse.json(
        { message: 'Account awaiting approval from an administrator.', messageAr: 'حسابك في انتظار موافقة المشرف.' },
        { status: 403 }
      );
    }
    if (user.status === 'rejected') {
      return NextResponse.json(
        { message: 'Your account registration was rejected.', messageAr: 'تم رفض طلب تسجيلك.' },
        { status: 403 }
      );
    }
    if (user.status === 'suspended') {
      return NextResponse.json(
        { message: 'Your account has been suspended.', messageAr: 'تم تعليق حسابك.' },
        { status: 403 }
      );
    }

    // Update lastLogin without triggering any hooks
    await prisma.user.update({ where: { id: user.id }, data: { lastLogin: new Date() } });
    await logAudit(AuditAction.LOGIN, 'User', user.id,
      { email: user.email, role: user.role },
      { userId: user.id, userName: user.name, userEmail: user.email,
        ip: req.headers.get('x-forwarded-for') ?? undefined,
        userAgent: req.headers.get('user-agent') ?? undefined }
    );

    const token = signToken(user.id);
    const { password: _pw, resetPasswordToken: _rpt, resetPasswordExpires: _rpe, ...safeUser } = user;
    void _pw; void _rpt; void _rpe;

    return NextResponse.json({ token, user: safeUser });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ message: 'Server error' }, { status: 500 });
  }
}
