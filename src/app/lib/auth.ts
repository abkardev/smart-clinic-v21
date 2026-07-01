import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from './prisma';

const JWT_SECRET = process.env.JWT_SECRET || 'smartclinic_jwt_secret_change_in_prod';

export function signToken(userId: string): string {
  return jwt.sign({ id: userId }, JWT_SECRET, { expiresIn: '7d' });
}

export function verifyToken(token: string): { id: string } {
  return jwt.verify(token, JWT_SECRET) as { id: string };
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function comparePassword(candidate: string, hash: string): Promise<boolean> {
  return bcrypt.compare(candidate, hash);
}

// ─── Route-level auth guard ───────────────────────────────────────────────────
// Usage in API route:
//   const { user, error } = await getAuthUser(req);
//   if (error) return error;

export async function getAuthUser(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;

  if (!token) {
    return {
      user: null,
      error: NextResponse.json({ message: 'Not authenticated' }, { status: 401 }),
    };
  }

  try {
    const decoded = verifyToken(token);
    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        doctorId: true,
        preferredLang: true,
        lastLogin: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      return {
        user: null,
        error: NextResponse.json({ message: 'User not found' }, { status: 401 }),
      };
    }

    if (user.status !== 'approved') {
      return {
        user: null,
        error: NextResponse.json({ message: 'Account not approved' }, { status: 403 }),
      };
    }

    return { user, error: null };
  } catch {
    return {
      user: null,
      error: NextResponse.json({ message: 'Invalid or expired token' }, { status: 401 }),
    };
  }
}

// Role guard — call after getAuthUser
export function requireRole(
  user: { role: string },
  ...roles: string[]
): NextResponse | null {
  if (!roles.includes(user.role)) {
    return NextResponse.json({ message: 'Insufficient permissions' }, { status: 403 });
  }
  return null;
}

// Safe user object (strips sensitive fields)
export function toSafeUser(user: Record<string, unknown>) {
  const { password, resetPasswordToken, resetPasswordExpires, ...safe } = user;
  void password; void resetPasswordToken; void resetPasswordExpires;
  return safe;
}
