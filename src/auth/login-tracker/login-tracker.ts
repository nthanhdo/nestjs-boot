import { Injectable, Logger } from '@nestjs/common';

export interface LoginTrackerOptions {
  /** Max failed attempts before lockout. Default: 5 */
  maxAttempts?: number;
  /** Lockout duration in ms. Default: 15 minutes */
  lockoutDuration?: number;
}

export const LOGIN_TRACKER_OPTIONS = 'BOOT_LOGIN_TRACKER_OPTIONS';

@Injectable()
export class LoginTracker {
  private readonly logger = new Logger(LoginTracker.name);
  private attempts = new Map<string, { count: number; lockedUntil?: Date }>();

  constructor(private readonly options?: LoginTrackerOptions) {}

  private get maxAttempts(): number { return this.options?.maxAttempts ?? 5; }
  private get lockoutDuration(): number { return this.options?.lockoutDuration ?? 15 * 60 * 1000; }

  /** Check if account is currently locked */
  isLocked(identifier: string): boolean {
    const entry = this.attempts.get(identifier);
    if (!entry?.lockedUntil) return false;
    if (entry.lockedUntil > new Date()) return true;
    // Lock expired — reset
    this.attempts.delete(identifier);
    return false;
  }

  /** Record a failed login attempt. Returns true if account is now locked. */
  recordFailure(identifier: string): boolean {
    const entry = this.attempts.get(identifier) ?? { count: 0 };
    entry.count++;
    if (entry.count >= this.maxAttempts) {
      entry.lockedUntil = new Date(Date.now() + this.lockoutDuration);
      this.attempts.set(identifier, entry);
      this.logger.warn(`Account locked: ${identifier} (${entry.count} failed attempts)`);
      return true;
    }
    this.attempts.set(identifier, entry);
    return false;
  }

  /** Record a successful login — reset failure count */
  recordSuccess(identifier: string): void {
    this.attempts.delete(identifier);
  }

  /** Get remaining attempts before lockout */
  getRemainingAttempts(identifier: string): number {
    const entry = this.attempts.get(identifier);
    if (!entry) return this.maxAttempts;
    return Math.max(0, this.maxAttempts - entry.count);
  }

  /** Manually unlock an account */
  unlock(identifier: string): void {
    this.attempts.delete(identifier);
  }
}
