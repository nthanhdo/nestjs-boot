/**
 * Startup time profiler for nestjs-boot.
 *
 * Measures and logs time spent in each createApp phase.
 * Only active in development mode (NODE_ENV !== 'production').
 *
 * Output example:
 * ```
 * [boot] Config validation: 12ms
 * [boot] OTel init: 45ms
 * [boot] NestFactory.create: 340ms
 * [boot] Transports: 120ms
 * [boot] Total: 517ms
 * ```
 *
 * Use this to identify which modules are slowing down cold start.
 * For serverless cold start optimization, see docs/guides/serverless-considerations.md
 */

export interface PhaseResult {
  phase: string;
  durationMs: number;
}

export class StartupProfiler {
  private readonly enabled: boolean;
  private readonly startTime: number;
  private readonly phases: PhaseResult[] = [];
  private phaseStart: number;
  private currentPhase: string | null = null;

  constructor(enabled?: boolean) {
    // Auto-enable in non-production environments unless explicitly set
    this.enabled = enabled ?? (process.env.NODE_ENV !== 'production');
    this.startTime = Date.now();
    this.phaseStart = this.startTime;
  }

  /**
   * Start timing a named phase.
   * Any previous phase is automatically ended.
   */
  startPhase(phase: string): void {
    if (!this.enabled) return;

    if (this.currentPhase !== null) {
      this.endPhase();
    }

    this.currentPhase = phase;
    this.phaseStart = Date.now();
  }

  /**
   * End the current phase and record its duration.
   */
  endPhase(): void {
    if (!this.enabled || this.currentPhase === null) return;

    const durationMs = Date.now() - this.phaseStart;
    this.phases.push({ phase: this.currentPhase, durationMs });
    this.currentPhase = null;
  }

  /**
   * Log all recorded phases + total time to console.
   * Call this after the app is fully initialized.
   */
  log(): void {
    if (!this.enabled) return;

    // End any open phase
    if (this.currentPhase !== null) {
      this.endPhase();
    }

    const total = Date.now() - this.startTime;

    for (const { phase, durationMs } of this.phases) {
      console.log(`[boot] ${phase}: ${durationMs}ms`);
    }
    console.log(`[boot] Total: ${total}ms`);
  }

  /**
   * Returns all recorded phase results.
   * Useful for programmatic inspection / testing.
   */
  getResults(): ReadonlyArray<PhaseResult> {
    return [...this.phases];
  }

  /**
   * Returns total elapsed time in milliseconds since profiler was created.
   */
  getTotalMs(): number {
    return Date.now() - this.startTime;
  }

  /**
   * Returns true if the profiler is active.
   */
  isEnabled(): boolean {
    return this.enabled;
  }
}

/**
 * Create a no-op profiler (zero overhead in production).
 * All methods are stubs that do nothing and return immediately.
 */
export function createNoOpProfiler(): StartupProfiler {
  return new StartupProfiler(false);
}
