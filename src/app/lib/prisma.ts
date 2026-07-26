import { PrismaClient } from '@prisma/client';
import { logger } from './logger';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient(): PrismaClient {
  const client = new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });

  const version = require('@prisma/client/package.json').version;
  logger.info('Prisma client initialized', {
    node: process.version,
    platform: `${process.platform} (${process.arch})`,
    prismaVersion: version,
    env: process.env.NODE_ENV || 'development',
  });

  return client;
}

function getPrismaInstance(): PrismaClient {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = createPrismaClient();
  }
  return globalForPrisma.prisma;
}

let _validated = false;

function ensureValidated(): void {
  if (_validated) return;
  _validated = true;
  import('./config').then(({ validateConfigOrThrow }) => validateConfigOrThrow()).catch(() => {});
}

export const prisma = new Proxy({} as PrismaClient, {
  get(_, prop: keyof PrismaClient) {
    ensureValidated();
    return getPrismaInstance()[prop];
  },
});
