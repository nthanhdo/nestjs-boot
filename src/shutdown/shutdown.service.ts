import { Inject, Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { ShutdownOptions } from './interfaces';
import { InFlightTracker } from './in-flight-tracker';
import { SignalHandler } from './signal-handler';
import {
  SHUTDOWN_OPTIONS,
  DEFAULT_SHUTDOWN_TIMEOUT,
  DEFAULT_SHUTDOWN_SIGNALS,
} from './constants';

/**
 * Detects whether the current process is running inside Kubernetes.
 * K8s always sets KUBERNETES_SERVICE_HOST in the pod environment.
 */
export function isKubernetesEnvironment(): boolean {
  return typeof process.env.KUBERNETES_SERVICE_HOST === 'string' &&
    process.env.KUBERNETES_SERVICE_HOST.length > 0;
}

/**
 * Returns the recommended K8s preStop delay in milliseconds.
 * Reads BOOT_PRESTOP_DELAY_MS env var or falls back to 5000.
 */
export function getK8sPreStopDelay(): number {
  const raw = process.env.BOOT_PRESTOP_DELAY_MS;
  const parsed = raw ? parseInt(raw, 10) : NaN;
  return isNaN(parsed) ? 5_000 : parsed;
}

/**
 * ShutdownService — orchestrates graceful shutdown.
 *
 * Delegates specific concerns to focused classes:
 * - InFlightTracker: tracks in-flight HTTP requests
 * - SignalHandler: registers OS signal handlers
 * - K8s detection: utility functions (isKubernetesEnvironment, getK8sPreStopDelay)
 */
@Injectable()
export class ShutdownService implements OnApplicationShutdown {
  private readonly logger = new Logger(ShutdownService.name);
  private readonly drainStrategy: 'drain' | 'immediate';
  private readonly beforeShutdownHook?: () => Promise<void>;
  private readonly signalHandler: SignalHandler;
  private readonly signals: string[];

  /** Set to true when shutdown is initiated — health endpoint reads this */
  private shuttingDownFlag = false;

  constructor(
    @Inject(SHUTDOWN_OPTIONS) options: ShutdownOptions,
    @Inject(HttpAdapterHost) private readonly httpAdapterHost: HttpAdapterHost,
    @Inject(InFlightTracker) public readonly inFlightTracker: InFlightTracker,
  ) {
    const timeout = options.timeout ?? DEFAULT_SHUTDOWN_TIMEOUT;
    this.signals = options.signals ?? DEFAULT_SHUTDOWN_SIGNALS;
    this.beforeShutdownHook = options.beforeShutdown;
    this.drainStrategy = options.drainStrategy ?? 'drain';

    this.signalHandler = new SignalHandler(this.signals, timeout, () => {
      this.shuttingDownFlag = true;
    });
    this.signalHandler.register();
    this.logK8sInfo();
  }

  /**
   * Returns true if a shutdown has been initiated.
   * Used by the health endpoint to return 503 during shutdown.
   */
  isShuttingDownNow(): boolean {
    return this.shuttingDownFlag;
  }

  /**
   * Returns the number of currently in-flight HTTP requests.
   * @deprecated Use inFlightTracker.getCount() directly
   */
  getInFlightCount(): number {
    return this.inFlightTracker.getCount();
  }

  /**
   * Increment in-flight request counter.
   * @deprecated Use inFlightTracker.increment() directly
   */
  incrementInFlight(): void {
    this.inFlightTracker.increment();
  }

  /**
   * Decrement in-flight request counter.
   * @deprecated Use inFlightTracker.decrement() directly
   */
  decrementInFlight(): void {
    this.inFlightTracker.decrement();
  }

  /**
   * Returns the list of signals this service listens to.
   */
  getSignals(): string[] {
    return [...this.signals];
  }

  private logK8sInfo(): void {
    if (isKubernetesEnvironment()) {
      const delay = getK8sPreStopDelay();
      this.logger.log(
        `K8s detected — preStop delay: ${delay}ms (configure via BOOT_PRESTOP_DELAY_MS). ` +
        `Ensure your deployment.yaml lifecycle.preStop matches this value.`,
      );
    }
  }

  /**
   * Called by NestJS during application shutdown (after enableShutdownHooks).
   * Orchestrates the ordered teardown sequence with per-phase logging.
   */
  async onApplicationShutdown(signal?: string): Promise<void> {
    const startTime = Date.now();
    this.logger.log(`onApplicationShutdown triggered (signal: ${signal ?? 'none'})`);
    this.shuttingDownFlag = true;

    // Phase 1: Custom pre-shutdown hook
    if (this.beforeShutdownHook) {
      this.logger.log('Phase 1: Running beforeShutdown hook...');
      try {
        await this.beforeShutdownHook();
        this.logger.log('Phase 1: beforeShutdown hook completed');
      } catch (error) {
        this.logger.error('Phase 1: beforeShutdown hook failed', error);
      }
    }

    // Phase 2: Stop accepting new HTTP connections + drain in-flight
    this.logger.log('Phase 2: Stopping HTTP server...');
    try {
      const httpAdapter = this.httpAdapterHost?.httpAdapter;
      if (httpAdapter) {
        const server = httpAdapter.getHttpServer();
        if (server) {
          const inFlight = this.inFlightTracker.getCount();
          if (this.drainStrategy === 'drain' && inFlight > 0) {
            this.logger.log(
              `Phase 2: Draining ${inFlight} in-flight request(s) — strategy: drain`,
            );
          }

          await new Promise<void>((resolve, reject) => {
            server.close((err?: Error) => {
              if (err) reject(err);
              else resolve();
            });
          });

          // Drain keep-alive connections (Node 18.2+)
          if (typeof server.closeAllConnections === 'function') {
            server.closeAllConnections();
            this.logger.log('Phase 2: Keep-alive connections drained (closeAllConnections)');
          }

          this.logger.log('Phase 2: HTTP server closed');
        }
      }
    } catch (error) {
      this.logger.error('Phase 2: Failed to close HTTP server', error);
    }

    const elapsed = Date.now() - startTime;
    this.logger.log(`Shutdown complete in ${(elapsed / 1000).toFixed(1)}s`);
  }
}
