import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  splitting: false,
  clean: true,
  sourcemap: true,
  external: [
    '@nestjs/common',
    '@nestjs/core',
    '@nestjs/platform-express',
    '@nestjs/mongoose',
    '@nestjs/terminus',
    'mongoose',
    'rxjs',
    'ioredis',
  ],
});
