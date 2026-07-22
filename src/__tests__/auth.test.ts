import { describe, it, expect, beforeAll } from 'vitest';
import { prisma, cleanDatabase } from './setup';
import { createTestUser } from './helpers';

describe('Authentication', () => {
  beforeAll(async () => {
    await cleanDatabase();
  });

  describe('User Creation', () => {
    it('should create a user with hashed password', async () => {
      const user = await createTestUser();
      expect(user.id).toBeTruthy();
      expect(user.role).toBe('superadmin');

      const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
      expect(dbUser).toBeTruthy();
      expect(dbUser!.password).not.toBe('TestPass123!');
    });
  });

  describe('JWT Tokens', () => {
    it('should generate a valid token on user creation', async () => {
      const user = await createTestUser({ email: 'jwt-test@test.com' });
      expect(user.token).toBeTruthy();
      expect(typeof user.token).toBe('string');
      expect(user.token.split('.')).toHaveLength(3);
    });
  });

  describe('Role Permissions', () => {
    it('should create users with different roles', async () => {
      const admin = await createTestUser({ email: 'admin-role@test.com', role: 'admin' });
      expect(admin.role).toBe('admin');

      const doctor = await createTestUser({ email: 'doctor-role@test.com', role: 'doctor' });
      expect(doctor.role).toBe('doctor');

      const doctor2 = await createTestUser({ email: 'doctor2@test.com', role: 'doctor' });
      expect(doctor2.role).toBe('doctor');
    });
  });

  describe('User Status', () => {
    it('should create users with pending status', async () => {
      const pending = await createTestUser({
        email: 'pending@test.com',
        status: 'pending',
        role: 'doctor',
      });
      expect(pending.id).toBeTruthy();

      const dbUser = await prisma.user.findUnique({ where: { id: pending.id } });
      expect(dbUser!.status).toBe('pending');
    });
  });
});
