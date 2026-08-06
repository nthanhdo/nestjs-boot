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
}
