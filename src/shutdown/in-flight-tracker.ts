import { Injectable } from '@nestjs/common';

/**
 * InFlightTracker — tracks the number of currently in-flight HTTP requests.
 *
 * Extracted from ShutdownService (SRP) so it can be used independently
 * by interceptors and health checks without coupling to shutdown logic.
 */
@Injectable()
export class InFlightTracker {
  private count = 0;

  /** Increment in-flight request counter. Called by InFlightRequestInterceptor on request start. */
  increment(): void {
    this.count++;
  }

  /** Decrement in-flight request counter. Called by InFlightRequestInterceptor on request complete. */
  decrement(): void {
    if (this.count > 0) {
      this.count--;
    }
  }

  /** Returns the number of currently in-flight HTTP requests. */
  getCount(): number {
    return this.count;
  }
}
