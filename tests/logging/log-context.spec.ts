import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildLogContext, resetLogContextCache } from '../../src/logging/log-context';

describe('buildLogContext', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Reset the singleton cache before each test so env changes take effect
    resetLogContextCache();
  });

  afterEach(() => {
    // Restore env and reset cache
    process.env = { ...originalEnv };
    resetLogContextCache();
  });

  it('auto-populates environment from NODE_ENV', () => {
    process.env['NODE_ENV'] = 'test';
    const ctx = buildLogContext();
    expect(ctx.environment).toBe('test');
  });

  it('merges user-provided extra fields into the context', () => {
    process.env['NODE_ENV'] = 'development';
    const ctx = buildLogContext({ region: 'us-east-1', team: 'platform' });
    expect(ctx.region).toBe('us-east-1');
    expect(ctx.team).toBe('platform');
    // Auto-detected fields must still be present
    expect(ctx.environment).toBe('development');
  });

  it('OTEL_SERVICE_NAME env var overrides auto-detected service name', () => {
    process.env['OTEL_SERVICE_NAME'] = 'payment-service';
    const ctx = buildLogContext();
    expect(ctx.service).toBe('payment-service');
  });
});
