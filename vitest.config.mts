import { defineConfig } from 'vitest/config';
import swc from 'unplugin-swc';

export default defineConfig({
  plugins: [
    swc.vite({
      module: { type: 'es6' },
      jsc: {
        parser: { syntax: 'typescript', decorators: true },
        transform: { legacyDecorator: true, decoratorMetadata: true },
      },
    }),
  ],
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
