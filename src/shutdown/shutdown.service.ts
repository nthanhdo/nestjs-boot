import { Inject, Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { ShutdownOptions } from './interfaces';
import {
  SHUTDOWN_OPTIONS,
  DEFAULT_SHUTDOWN_TIMEOUT,
  DEFAULT_SHUTDOWN_SIGNALS,
} from './constants';

@Injectable()
export class ShutdownService implements OnApplicationShutdown {
  private readonly logger = new Logger(ShutdownService.name);
  private readonly timeout: number;
  private readonly signals: string[];
  private readonly beforeShutdownHook?: () => Promise<void>;
  private isShuttingDown = false;

  constructor(
    @Inject(SHUTDOWN_OPTIONS) options: ShutdownOptions,
    @Inject(HttpAdapterHost) private readonly httpAdapterHost: HttpAdapterHost,
  ) {
    this.timeout = options.timeout ?? DEFAULT_SHUTDOWN_TIMEOUT;
    this.signals = options.signals ?? DEFAULT_SHUTDOWN_SIGNALS;
    this.beforeShutdownHook = options.beforeShutdown;

    this.registerSignalHandlers();
  }

  /**
   * Returns the list of signals this service listens to.
   */
  getSignals(): string[] {
    return [...this.signals];
  }

  private registerSignalHandlers(): void {
    for (const signal of this.signals) {
      process.on(signal, () => {
        this.logger.log(`Received ${signal} — initiating graceful shutdown`);
        this.initiateShutdown();
      });
    }
    this.logger.log(`Signal handlers registered: ${this.signals.join(', ')}`);
  }

  private initiateShutdown(): void {
    if (this.isShuttingDown) {
      this.logger.warn('Shutdown already in progress — ignoring duplicate signal');
      return;
    }
    this.isShuttingDown = true;

    // Force-exit safety net
    const timer = setTimeout(() => {
      this.logger.error(
        `Graceful shutdown timed out after ${this.timeout}ms — forcing exit`,
      );
      process.exit(1);
    }, this.timeout);

    // Unref so it doesn't keep the event loop alive if everything else finishes
    if (timer.unref) {
      timer.unref();
    }
  }

  /**
   * Called by NestJS during application shutdown (after enableShutdownHooks).
   * Orchestrates the ordered teardown sequence.
   */
  async onApplicationShutdown(signal?: string): Promise<void> {
    this.logger.log(`onApplicationShutdown triggered (signal: ${signal ?? 'none'})`);

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

    // Phase 2: Stop accepting new HTTP connections
    this.logger.log('Phase 2: Closing HTTP server...');
    try {
      const httpAdapter = this.httpAdapterHost?.httpAdapter;
      if (httpAdapter) {
        const server = httpAdapter.getHttpServer();
        if (server) {
          await new Promise<void>((resolve, reject) => {
            server.close((err?: Error) => {
              if (err) reject(err);
              else resolve();
            });
          });
          this.logger.log('Phase 2: HTTP server closed');
        }
      }
    } catch (error) {
      this.logger.error('Phase 2: Failed to close HTTP server', error);
    }

    // Phases 3-6 (flush metrics, close DB, cache, broker) are handled by
    // NestJS lifecycle — each module's own onModuleDestroy / onApplicationShutdown
    // hooks fire automatically. This service only orchestrates the entry point
    // and the beforeShutdown custom hook.

    this.logger.log('Graceful shutdown sequence completed');
  }
}
