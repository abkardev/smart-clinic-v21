import { prisma } from './setup';
import { hashPassword, signToken } from '@/app/lib/auth';
import type { Doctor, UserRole, UserStatus } from '@prisma/client';

export interface TestUser {
  id: string;
  name: string;
  email: string;
  role: string;
  token: string;
}

export async function createTestUser(overrides: Partial<{
  name: string; email: string; password: string; role: string; status: string;
}> = {}): Promise<TestUser> {
  const password = await hashPassword(overrides.password ?? 'TestPass123!');
  const user = await prisma.user.create({
    data: {
      name: overrides.name ?? 'Test Admin',
      email: overrides.email ?? 'admin@test.com',
      password,
      role: (overrides.role ?? 'superadmin') as UserRole,
      status: (overrides.status ?? 'approved') as UserStatus,
      preferredLang: 'en',
    },
  });

  const token = signToken(user.id);
  return { id: user.id, name: user.name, email: user.email, role: user.role, token };
}

export async function createTestDoctor(overrides: Partial<Pick<Doctor, 'nameEn' | 'calendarId' | 'slotDuration'>> = {}): Promise<Doctor> {
  const doctor = await prisma.doctor.create({
    data: {
      nameEn: overrides.nameEn ?? 'Dr. Smith',
      nameAr: 'د. سميث',
      calendarId: overrides.calendarId ?? 'test-calendar-id',
      slotDuration: overrides.slotDuration ?? 30,
      workingStart: '09:00',
      workingEnd: '17:00',
      workingDays: [0, 1, 2, 3, 4],
    },
  });
  return doctor;
}

export function mockNextRequest(url: string, opts: {
  method?: string;
  body?: unknown;
  token?: string;
  headers?: Record<string, string>;
} = {}) {
  const { method = 'GET', body, token, headers = {} } = opts;
  const init: RequestInit & { headers: Record<string, string> } = {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
  };
  if (token) init.headers['Authorization'] = `Bearer ${token}`;
  if (body !== undefined) init.body = JSON.stringify(body);
  return new Request(url.startsWith('http') ? url : `http://localhost${url}`, init);
}
