import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./src/__tests__/setup.ts'],
    include: ['src/__tests__/**/*.test.ts'],
    exclude: ['node_modules', 'e2e'],
    testTimeout: 60000,
    hookTimeout: 60000,
    fileParallelism: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      include: ['src/app/**/*.ts', 'src/app/**/*.tsx'],
      exclude: [
        'src/__tests__/**',
        'src/app/**/*.d.ts',
        'src/app/lib/prisma.ts',
        'src/app/lib/logger.ts',
        '**/route.ts',
      ],
      thresholds: {
        statements: 90,
        functions: 90,
        branches: 85,
        lines: 90,
      },
    },
  },
});
