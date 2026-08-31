import { describe, it, expect, beforeEach } from 'vitest';
import { LoginTracker } from '../../src/auth/login-tracker/login-tracker';

describe('LoginTracker', () => {
  let tracker: LoginTracker;

  beforeEach(() => {
    tracker = new LoginTracker({ maxAttempts: 3, lockoutDuration: 60_000 });
  });

  it('is not locked by default', () => {
    expect(tracker.isLocked('user@test.com')).toBe(false);
  });

  it('recordFailure increments count and does not lock before maxAttempts', () => {
    expect(tracker.recordFailure('u1')).toBe(false);
    expect(tracker.recordFailure('u1')).toBe(false);
    expect(tracker.getRemainingAttempts('u1')).toBe(1);
  });

  it('locks after maxAttempts failures', () => {
    tracker.recordFailure('u2');
    tracker.recordFailure('u2');
    const locked = tracker.recordFailure('u2');
    expect(locked).toBe(true);
    expect(tracker.isLocked('u2')).toBe(true);
  });

  it('getRemainingAttempts returns maxAttempts for unknown identifier', () => {
    expect(tracker.getRemainingAttempts('unknown')).toBe(3);
  });

  it('getRemainingAttempts decrements with failures', () => {
    tracker.recordFailure('u3');
    expect(tracker.getRemainingAttempts('u3')).toBe(2);
  });

  it('recordSuccess resets failure count', () => {
    tracker.recordFailure('u4');
    tracker.recordFailure('u4');
    tracker.recordSuccess('u4');
    expect(tracker.isLocked('u4')).toBe(false);
    expect(tracker.getRemainingAttempts('u4')).toBe(3);
  });

  it('unlock clears lock', () => {
    tracker.recordFailure('u5');
    tracker.recordFailure('u5');
    tracker.recordFailure('u5'); // now locked
    tracker.unlock('u5');
    expect(tracker.isLocked('u5')).toBe(false);
  });

  it('uses default maxAttempts of 5 when not specified', () => {
    const defaultTracker = new LoginTracker();
    for (let i = 0; i < 4; i++) defaultTracker.recordFailure('u6');
    expect(defaultTracker.isLocked('u6')).toBe(false);
    defaultTracker.recordFailure('u6');
    expect(defaultTracker.isLocked('u6')).toBe(true);
  });

  it('isLocked returns false after lockout expires', async () => {
    const shortTracker = new LoginTracker({ maxAttempts: 1, lockoutDuration: 10 });
    shortTracker.recordFailure('u7');
    expect(shortTracker.isLocked('u7')).toBe(true);
    await new Promise((r) => setTimeout(r, 20));
    expect(shortTracker.isLocked('u7')).toBe(false);
  });
});
