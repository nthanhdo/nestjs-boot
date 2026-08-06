import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CircuitBreaker, CircuitBreakerOpenError } from '../../src/resilience/circuit-breaker';

describe('CircuitBreaker', () => {
  let cb: CircuitBreaker;

  beforeEach(() => {
    cb = new CircuitBreaker({ failureThreshold: 3, resetTimeout: 100, halfOpenMax: 1 });
  });

  it('passes through when CLOSED', async () => {
    const result = await cb.execute(() => Promise.resolve('ok'));
    expect(result).toBe('ok');
    expect(cb.getState()).toBe('CLOSED');
  });

  it('opens after threshold failures', async () => {
    const fail = () => cb.execute(() => Promise.reject(new Error('fail')));
    await expect(fail()).rejects.toThrow('fail');
    await expect(fail()).rejects.toThrow('fail');
    expect(cb.getState()).toBe('CLOSED');
    await expect(fail()).rejects.toThrow('fail');
    expect(cb.getState()).toBe('OPEN');
  });

  it('rejects immediately when OPEN', async () => {
    // Force open
    for (let i = 0; i < 3; i++) {
      await cb.execute(() => Promise.reject(new Error('fail'))).catch(() => {});
    }
    expect(cb.getState()).toBe('OPEN');
    await expect(cb.execute(() => Promise.resolve('ok'))).rejects.toThrow(CircuitBreakerOpenError);
  });

  it('transitions to HALF_OPEN after resetTimeout', async () => {
    for (let i = 0; i < 3; i++) {
      await cb.execute(() => Promise.reject(new Error('fail'))).catch(() => {});
    }
    expect(cb.getState()).toBe('OPEN');

    // Wait for resetTimeout
    await new Promise((r) => setTimeout(r, 150));

    // Next call should transition to HALF_OPEN and pass through
    const result = await cb.execute(() => Promise.resolve('recovered'));
    expect(result).toBe('recovered');
    expect(cb.getState()).toBe('CLOSED');
  });

  it('returns to OPEN on HALF_OPEN failure', async () => {
    for (let i = 0; i < 3; i++) {
      await cb.execute(() => Promise.reject(new Error('fail'))).catch(() => {});
    }

    await new Promise((r) => setTimeout(r, 150));

    // HALF_OPEN attempt fails → back to OPEN
    await expect(cb.execute(() => Promise.reject(new Error('still broken')))).rejects.toThrow('still broken');
    expect(cb.getState()).toBe('OPEN');
  });

  it('reset() returns to CLOSED', async () => {
    for (let i = 0; i < 3; i++) {
      await cb.execute(() => Promise.reject(new Error('fail'))).catch(() => {});
    }
    expect(cb.getState()).toBe('OPEN');
    cb.reset();
    expect(cb.getState()).toBe('CLOSED');
    const result = await cb.execute(() => Promise.resolve('ok'));
    expect(result).toBe('ok');
  });
});
