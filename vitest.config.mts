import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    root: '.',
    include: ['tests/**/*.spec.ts'],
    exclude: [
      'tests/cli/**',           // CLI spawns process — timeout in CI
      'tests/testing/**',       // requires full NestJS app bootstrap
    ],
    testTimeout: 10000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts', 'src/**/index.ts'],
    },
  },
  resolve: {
    alias: {
      '@': './src',
    },
  },
});
