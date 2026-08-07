/**
 * Drain strategy for in-flight HTTP requests on shutdown.
 *
 * - `'drain'`  — wait for all in-flight requests to complete before closing (default)
 * - `'immediate'` — close the server immediately without waiting for in-flight requests
 */
export type DrainStrategy = 'drain' | 'immediate';

/**
 * Options for GracefulShutdownModule.
 */
export interface ShutdownOptions {
  /** Maximum time (ms) to wait for graceful shutdown before force-exit (default: 30000) */
  timeout?: number;
  /** OS signals to listen for (default: ['SIGTERM', 'SIGINT']) */
  signals?: string[];
  /** Custom hook called before NestJS shutdown sequence begins */
  beforeShutdown?: () => Promise<void>;
  /**
   * In-flight request drain strategy (default: 'drain').
   *
   * - `'drain'`  — wait for in-flight requests to finish before closing (zero-downtime)
   * - `'immediate'` — close immediately without draining (faster, but drops in-flight requests)
   *
   * In K8s, always use `'drain'` paired with a `preStop: sleep 5` hook so the
   * load balancer stops routing before SIGTERM arrives.
   */
  drainStrategy?: DrainStrategy;
}
