import { describe, it, expect, vi } from 'vitest';
import { Retry } from '../../src/resilience/retry.decorator';

// Helper to create a class with a decorated method
function createRetryable(options?: Parameters<typeof Retry>[0]) {
  class TestService {
    callCount = 0;
    fn: () => Promise<string>;

    constructor(fn: () => Promise<string>) {
      this.fn = fn;
    }

    @Retry({ delay: 10, maxDelay: 100, ...options })
    async doWork(): Promise<string> {
      this.callCount++;
      return this.fn();
    }
  }
  return TestService;
}

describe('Retry', () => {
  it('retries on failure and succeeds on 2nd attempt', async () => {
    let calls = 0;
    const Service = createRetryable({ maxAttempts: 3 });
    const svc = new Service(async () => {
      calls++;
      if (calls < 2) throw new Error('transient');
      return 'ok';
    });

    const result = await svc.doWork();
    expect(result).toBe('ok');
    expect(svc.callCount).toBe(2);
  });

  it('gives up after maxAttempts', async () => {
    const Service = createRetryable({ maxAttempts: 3 });
    const svc = new Service(async () => {
      throw new Error('permanent');
    });

    await expect(svc.doWork()).rejects.toThrow('permanent');
    expect(svc.callCount).toBe(3);
  });

  it('exponential backoff delays increase', async () => {
    const timestamps: number[] = [];
    let calls = 0;
    const Service = createRetryable({ maxAttempts: 4, backoff: 'exponential', delay: 50, maxDelay: 5000 });
    const svc = new Service(async () => {
      timestamps.push(Date.now());
      calls++;
      if (calls < 4) throw new Error('fail');
      return 'ok';
    });

    await svc.doWork();
    // Check that delays are increasing (exponential)
    const deltas = [];
    for (let i = 1; i < timestamps.length; i++) {
      deltas.push(timestamps[i] - timestamps[i - 1]);
    }
    // 2nd delay should be >= 1st delay (exponential growth)
    expect(deltas.length).toBe(3);
    expect(deltas[1]).toBeGreaterThanOrEqual(deltas[0]);
  });

  it('respects retryOn predicate', async () => {
    const Service = createRetryable({
      maxAttempts: 3,
      retryOn: (err) => err.message === 'retry-me',
    });
    const svc = new Service(async () => {
      throw new Error('do-not-retry');
    });

    await expect(svc.doWork()).rejects.toThrow('do-not-retry');
    // Should not retry since predicate returns false
    expect(svc.callCount).toBe(1);
  });
});
