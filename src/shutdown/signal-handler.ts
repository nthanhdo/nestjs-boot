import { Logger } from '@nestjs/common';

/**
 * SignalHandler — registers process signal handlers for graceful shutdown.
 *
 * Extracted from ShutdownService (SRP) to isolate signal registration
 * from shutdown orchestration.
 */
export class SignalHandler {
  private readonly logger = new Logger('SignalHandler');
  private isShuttingDown = false;

  constructor(
    private readonly signals: string[],
    private readonly timeout: number,
    private readonly onSignal: () => void,
  ) {}

  /**
   * Register signal handlers. Call once during module init.
   */
  register(): void {
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

    if (timer.unref) {
      timer.unref();
    }

    this.onSignal();
  }
}
