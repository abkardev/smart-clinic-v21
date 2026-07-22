import { beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { config } from 'dotenv';
import path from 'path';

config({ path: path.resolve(__dirname, '../../.env.test') });

const TEST_DB_URL = process.env.DATABASE_URL;
if (!TEST_DB_URL) {
  throw new Error('DATABASE_URL must be set in .env.test for integration tests. For unit-only tests, mock Prisma.');
}

const prisma = new PrismaClient();

beforeAll(async () => {
  // Ensure the database is reachable
  await prisma.$connect();
});

afterAll(async () => {
  await prisma.$disconnect();
});

export { prisma };

export async function cleanDatabase() {
  // Delete in reverse dependency order
  await prisma.calendarSyncJob.deleteMany();
  await prisma.calendarRetryLock.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.booking.deleteMany();
  await prisma.blockedSlot.deleteMany();
  await prisma.holiday.deleteMany();
  await prisma.holidayDoctor.deleteMany();
  await prisma.doctor.deleteMany();
  await prisma.user.deleteMany();
  await prisma.offer.deleteMany();
  await prisma.rateLimit.deleteMany();
  await prisma.idempotencyLock.deleteMany();
}
