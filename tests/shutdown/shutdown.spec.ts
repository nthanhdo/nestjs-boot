import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { HttpAdapterHost } from '@nestjs/core';
import { ShutdownService } from '../../src/shutdown/shutdown.service';
import { InFlightTracker } from '../../src/shutdown/in-flight-tracker';
import {
  SHUTDOWN_OPTIONS,
  DEFAULT_SHUTDOWN_SIGNALS,
  DEFAULT_SHUTDOWN_TIMEOUT,
} from '../../src/shutdown/constants';
import { ShutdownModule } from '../../src/shutdown/shutdown.module';

describe('ShutdownService', () => {
  let originalListenerCounts: Record<string, number>;

  beforeEach(() => {
    originalListenerCounts = {};
    for (const sig of ['SIGTERM', 'SIGINT', 'SIGUSR1']) {
      originalListenerCounts[sig] = process.listenerCount(sig);
    }
  });

  afterEach(() => {
    // Remove any listeners we added beyond the original count
    for (const sig of ['SIGTERM', 'SIGINT', 'SIGUSR1']) {
      while (process.listenerCount(sig) > originalListenerCounts[sig]) {
        const listeners = process.listeners(sig);
        process.removeListener(sig, listeners[listeners.length - 1] as (...args: unknown[]) => void);
      }
    }
  });

  function createMockHttpAdapterHost(closeFn?: (cb: (err?: Error) => void) => void) {
    return {
      httpAdapter: {
        getHttpServer: () => ({
          close: closeFn ?? ((cb: (err?: Error) => void) => cb()),
        }),
      },
    };
  }

  async function createService(
    options: Record<string, unknown> = {},
    httpAdapterHost?: unknown,
  ): Promise<ShutdownService> {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: SHUTDOWN_OPTIONS,
          useValue: options,
        },
        {
          provide: HttpAdapterHost,
          useValue: httpAdapterHost ?? createMockHttpAdapterHost(),
        },
        InFlightTracker,
        ShutdownService,
      ],
    }).compile();

    return module.get(ShutdownService);
  }

  it('should register signal handlers for default signals', async () => {
    await createService();

    for (const sig of DEFAULT_SHUTDOWN_SIGNALS) {
      expect(process.listenerCount(sig)).toBe(originalListenerCounts[sig] + 1);
    }
  });

  it('should register custom signals when configured', async () => {
    const service = await createService({ signals: ['SIGUSR1'] });

    expect(process.listenerCount('SIGUSR1')).toBe(originalListenerCounts['SIGUSR1'] + 1);
    expect(service.getSignals()).toEqual(['SIGUSR1']);
    // Should NOT have registered default signals
    expect(process.listenerCount('SIGTERM')).toBe(originalListenerCounts['SIGTERM']);
  });

  it('should call beforeShutdown hook during onApplicationShutdown', async () => {
    const beforeShutdown = vi.fn().mockResolvedValue(undefined);
    const service = await createService({ beforeShutdown });

    await service.onApplicationShutdown('SIGTERM');

    expect(beforeShutdown).toHaveBeenCalledTimes(1);
  });

  it('should handle beforeShutdown hook errors without throwing', async () => {
    const beforeShutdown = vi.fn().mockRejectedValue(new Error('hook failed'));
    const service = await createService({ beforeShutdown });

    await expect(service.onApplicationShutdown('SIGTERM')).resolves.not.toThrow();
    expect(beforeShutdown).toHaveBeenCalledTimes(1);
  });

  it('should close HTTP server during shutdown', async () => {
    const closeFn = vi.fn((cb: (err?: Error) => void) => cb());
    const service = await createService({}, createMockHttpAdapterHost(closeFn));

    await service.onApplicationShutdown('SIGTERM');

    expect(closeFn).toHaveBeenCalledTimes(1);
  });

  it('should handle HTTP server close error gracefully', async () => {
    const closeFn = vi.fn((cb: (err?: Error) => void) => cb(new Error('close failed')));
    const service = await createService({}, createMockHttpAdapterHost(closeFn));

    await expect(service.onApplicationShutdown('SIGTERM')).resolves.not.toThrow();
  });

  it('should use default timeout constant of 30000', () => {
    expect(DEFAULT_SHUTDOWN_TIMEOUT).toBe(30_000);
  });
});

describe('ShutdownModule', () => {
  it('should create a global dynamic module with ShutdownService exported', () => {
    const dynamicModule = ShutdownModule.register();

    expect(dynamicModule.module).toBe(ShutdownModule);
    expect(dynamicModule.global).toBe(true);
    expect(dynamicModule.exports).toContain(ShutdownService);
  });

  it('should pass custom options to the options provider', () => {
    const options = { timeout: 5000, signals: ['SIGUSR2'] };
    const dynamicModule = ShutdownModule.register(options);

    const optionsProvider = (dynamicModule.providers as { provide: string; useValue: unknown }[]).find(
      (p) => p.provide === SHUTDOWN_OPTIONS,
    );
    expect(optionsProvider?.useValue).toEqual(options);
  });
});
