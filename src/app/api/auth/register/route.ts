export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import type { UserRole, UserStatus } from '@prisma/client';
import { hashPassword } from '@/app/lib/auth';
import { checkRateLimit } from '@/app/lib/rateLimit';

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const rl = checkRateLimit(`register:${ip}`, 5, 60 * 60 * 1000);
    if (!rl.allowed) {
      return NextResponse.json({ message: 'Too many registration attempts. Please try again later.', messageAr: 'محاولات تسجيل كثيرة. يرجى المحاولة لاحقاً.' }, { status: 429 });
    }

    const { name, email, password, role } = await req.json() as { name: string; email: string; password: string; role?: string };

    if (!name || !email || !password) {
      return NextResponse.json({ message: 'Name, email and password are required' }, { status: 400 });
    }

    const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (existing) {
      return NextResponse.json(
        { message: 'Email already registered', messageAr: 'البريد الإلكتروني مسجل مسبقاً' },
        { status: 409 }
      );
    }

    const count = await prisma.user.count();
    const isFirst = count === 0;

    await prisma.user.create({
      data: {
        name,
        email: email.toLowerCase(),
        password: await hashPassword(password),
        role: (isFirst ? 'superadmin' : (role ?? 'admin')) as UserRole,
        status: (isFirst ? 'approved' : 'pending') as UserStatus,
      },
    });

    return NextResponse.json(
      {
        message: isFirst
          ? 'Superadmin account created. You can now log in.'
          : 'Registration submitted successfully. Your account is pending approval.',
        messageAr: isFirst
          ? 'تم إنشاء حساب المشرف العام. يمكنك الآن تسجيل الدخول.'
          : 'تم إرسال طلب التسجيل بنجاح. حسابك في انتظار موافقة المشرف.',
        pending: !isFirst,
      },
      { status: 201 }
    );
  } catch (err) {
    console.error(err);
    return NextResponse.json({ message: 'Server error' }, { status: 500 });
  }
}
