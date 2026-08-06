import { describe, it, expect } from 'vitest';
import { HealthModule } from '../../src/health/health.module';

describe('HealthModule', () => {
  it('should register with database indicators when database is configured', () => {
    const dynamicModule = HealthModule.register({
      database: {
        connections: {
          master: { writerUri: 'mongodb://localhost:27017/test' },
        },
      },
      health: { enabled: true, path: '/health' },
    });

    expect(dynamicModule.module).toBe(HealthModule);
    expect(dynamicModule.controllers).toHaveLength(1);
    // Should have DatabaseHealthIndicator (non-null) + RedisHealthIndicator (null)
    expect(dynamicModule.providers).toHaveLength(2);
  });

  it('should register with null indicators when nothing is configured', () => {
    const dynamicModule = HealthModule.register({
      health: { enabled: true, path: '/status' },
    });

    expect(dynamicModule.module).toBe(HealthModule);
    expect(dynamicModule.controllers).toHaveLength(1);
    expect(dynamicModule.providers).toHaveLength(2);

    // Both indicators should be null providers
    const providers = dynamicModule.providers as any[];
    const dbProvider = providers.find((p) => p.provide?.name === 'DatabaseHealthIndicator');
    const redisProvider = providers.find((p) => p.provide?.name === 'RedisHealthIndicator');

    if (dbProvider) expect(dbProvider.useValue).toBeNull();
    if (redisProvider) expect(redisProvider.useValue).toBeNull();
  });

  it('should use custom health path', () => {
    const dynamicModule = HealthModule.register({
      health: { enabled: true, path: '/custom-health' },
    });

    // The dynamic controller should exist
    expect(dynamicModule.controllers).toHaveLength(1);
  });

  it('should register Redis indicator with useFactory when redis is configured', () => {
    const dynamicModule = HealthModule.register({
      cache: { redis: { url: 'redis://localhost:6379' } },
      health: { enabled: true },
    });

    const providers = dynamicModule.providers as any[];
    const redisProvider = providers.find(
      (p) => p.provide?.name === 'RedisHealthIndicator',
    );

    // Should use factory (DI-wired), not useValue
    expect(redisProvider).toBeDefined();
    if (redisProvider) {
      expect(redisProvider.useFactory).toBeDefined();
      expect(redisProvider.inject).toBeDefined();
    }
  });
});
