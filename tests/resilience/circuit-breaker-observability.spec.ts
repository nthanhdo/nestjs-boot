import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CircuitBreaker } from '../../src/resilience/circuit-breaker';
import { CircuitBreakerObservability } from '../../src/resilience/circuit-breaker-observability';
import { CircuitBreakerStateChangeEvent } from '../../src/resilience/circuit-breaker-state-change.event';

describe('CircuitBreaker Observability', () => {
  const fail = (cb: CircuitBreaker) =>
    cb.execute(() => Promise.reject(new Error('fail'))).catch(() => {});

  describe('event emission', () => {
    let eventBus: { emit: ReturnType<typeof vi.fn> };
    let cb: CircuitBreaker;

    beforeEach(() => {
      eventBus = { emit: vi.fn().mockResolvedValue(undefined) };
      const obs = new CircuitBreakerObservability(eventBus);
      cb = new CircuitBreaker({ failureThreshold: 2, resetTimeout: 50, name: 'test' }, obs);
    });

    it('emits event on CLOSED→OPEN transition', async () => {
      await fail(cb);
      await fail(cb);
      expect(cb.getState()).toBe('OPEN');

      const calls = eventBus.emit.mock.calls;
      const stateChangeCall = calls.find(
        (c: unknown[]) => c[0] instanceof CircuitBreakerStateChangeEvent && c[0].newState === 'OPEN',
      );
      expect(stateChangeCall).toBeDefined();
      const event = stateChangeCall![0] as CircuitBreakerStateChangeEvent;
      expect(event.breakerName).toBe('test');
      expect(event.previousState).toBe('CLOSED');
      expect(event.newState).toBe('OPEN');
      expect(event.failureCount).toBe(2);
      expect(event.timestamp).toBeInstanceOf(Date);
    });

    it('emits event on OPEN→HALF_OPEN→CLOSED recovery', async () => {
      await fail(cb);
      await fail(cb);
      expect(cb.getState()).toBe('OPEN');

      await new Promise((r) => setTimeout(r, 80));
      await cb.execute(() => Promise.resolve('ok'));
      expect(cb.getState()).toBe('CLOSED');

      const events = eventBus.emit.mock.calls
        .map((c: unknown[]) => c[0])
        .filter((e: unknown) => e instanceof CircuitBreakerStateChangeEvent);

      const transitions = events.map((e: CircuitBreakerStateChangeEvent) => `${e.previousState}→${e.newState}`);
      expect(transitions).toContain('CLOSED→OPEN');
      expect(transitions).toContain('OPEN→HALF_OPEN');
      expect(transitions).toContain('HALF_OPEN→CLOSED');
    });

    it('does not emit for same-state (no-op transition)', async () => {
      // One failure — stays CLOSED
      await fail(cb);
      expect(cb.getState()).toBe('CLOSED');

      const stateEvents = eventBus.emit.mock.calls
        .map((c: unknown[]) => c[0])
        .filter((e: unknown) => e instanceof CircuitBreakerStateChangeEvent);
      // No state change events (only the initial constructor doesn't emit for CLOSED→CLOSED)
      expect(stateEvents).toHaveLength(0);
    });
  });

  describe('metrics (prom-client)', () => {
    it('calls onFailure without error when no prom-client', async () => {
      const obs = new CircuitBreakerObservability();
      const cb = new CircuitBreaker({ failureThreshold: 2, name: 'noop' }, obs);
      // Should not throw even without prom-client real metrics
      await fail(cb);
      await fail(cb);
      expect(cb.getState()).toBe('OPEN');
    });
  });

  describe('graceful no-op without eventBus', () => {
    it('works without eventBus or metrics', async () => {
      const obs = new CircuitBreakerObservability();
      const cb = new CircuitBreaker({ failureThreshold: 2, resetTimeout: 50, name: 'solo' }, obs);
      await fail(cb);
      await fail(cb);
      expect(cb.getState()).toBe('OPEN');

      await new Promise((r) => setTimeout(r, 80));
      const result = await cb.execute(() => Promise.resolve('recovered'));
      expect(result).toBe('recovered');
      expect(cb.getState()).toBe('CLOSED');
    });
  });

  describe('without observability at all', () => {
    it('CircuitBreaker works without observability param', async () => {
      const cb = new CircuitBreaker({ failureThreshold: 2 });
      await fail(cb);
      await fail(cb);
      expect(cb.getState()).toBe('OPEN');
    });
  });
});
