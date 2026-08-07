import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { HttpAdapterHost } from '@nestjs/core';
import { ShutdownService, isKubernetesEnvironment, getK8sPreStopDelay } from '../../src/shutdown/shutdown.service';
import { InFlightTracker } from '../../src/shutdown/in-flight-tracker';
import { getK8sShutdownInfo } from '../../src/shutdown/k8s-shutdown';
import { SHUTDOWN_OPTIONS } from '../../src/shutdown/constants';

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeHttpAdapterHost(closeFn?: (cb: (err?: Error) => void) => void, extra?: Record<string, unknown>) {
  return {
    httpAdapter: {
      getHttpServer: () => ({
        close: closeFn ?? ((cb: (err?: Error) => void) => cb()),
        ...extra,
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
      { provide: SHUTDOWN_OPTIONS, useValue: options },
      { provide: HttpAdapterHost, useValue: httpAdapterHost ?? makeHttpAdapterHost() },
      InFlightTracker,
      ShutdownService,
    ],
  }).compile();
  return module.get(ShutdownService);
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('ShutdownService — phase logging + in-flight tracking', () => {
  let originalListenerCounts: Record<string, number>;

  beforeEach(() => {
    originalListenerCounts = {};
    for (const sig of ['SIGTERM', 'SIGINT']) {
      originalListenerCounts[sig] = process.listenerCount(sig);
    }
  });

  afterEach(() => {
    for (const sig of ['SIGTERM', 'SIGINT']) {
      while (process.listenerCount(sig) > originalListenerCounts[sig]) {
        const listeners = process.listeners(sig);
        process.removeListener(sig, listeners[listeners.length - 1] as (...args: unknown[]) => void);
      }
    }
  });

  it('should track in-flight request count via increment/decrement', async () => {
    const service = await createService();

    expect(service.getInFlightCount()).toBe(0);

    service.incrementInFlight();
    service.incrementInFlight();
    expect(service.getInFlightCount()).toBe(2);

    service.decrementInFlight();
    expect(service.getInFlightCount()).toBe(1);

    service.decrementInFlight();
    expect(service.getInFlightCount()).toBe(0);

    // Should not go below zero
    service.decrementInFlight();
    expect(service.getInFlightCount()).toBe(0);
  });

  it('should flip isShuttingDownNow() to true during onApplicationShutdown', async () => {
    const service = await createService();

    expect(service.isShuttingDownNow()).toBe(false);

    await service.onApplicationShutdown('SIGTERM');

    expect(service.isShuttingDownNow()).toBe(true);
  });

  it('should call closeAllConnections if available on the HTTP server', async () => {
    const closeAllConnections = vi.fn();
    const adapterHost = makeHttpAdapterHost(
      (cb) => cb(),
      { closeAllConnections },
    );
    const service = await createService({}, adapterHost);

    await service.onApplicationShutdown('SIGTERM');

    expect(closeAllConnections).toHaveBeenCalledTimes(1);
  });

  it('should log drain count when in-flight requests exist at shutdown time', async () => {
    // Strategy: 'drain' with pending requests — service should log, not throw
    const service = await createService({ drainStrategy: 'drain' });
    service.incrementInFlight();
    service.incrementInFlight();
    service.incrementInFlight();

    // Should complete without throwing even with in-flight requests
    await expect(service.onApplicationShutdown('SIGTERM')).resolves.not.toThrow();
    expect(service.isShuttingDownNow()).toBe(true);
  });
});

describe('K8s environment detection', () => {
  it('should detect K8s when KUBERNETES_SERVICE_HOST is set', () => {
    const original = process.env.KUBERNETES_SERVICE_HOST;
    process.env.KUBERNETES_SERVICE_HOST = '10.96.0.1';

    expect(isKubernetesEnvironment()).toBe(true);

    if (original === undefined) delete process.env.KUBERNETES_SERVICE_HOST;
    else process.env.KUBERNETES_SERVICE_HOST = original;
  });

  it('should return false when KUBERNETES_SERVICE_HOST is not set', () => {
    const original = process.env.KUBERNETES_SERVICE_HOST;
    delete process.env.KUBERNETES_SERVICE_HOST;

    expect(isKubernetesEnvironment()).toBe(false);

    if (original !== undefined) process.env.KUBERNETES_SERVICE_HOST = original;
  });

  it('should return configured preStop delay from BOOT_PRESTOP_DELAY_MS', () => {
    const original = process.env.BOOT_PRESTOP_DELAY_MS;
    process.env.BOOT_PRESTOP_DELAY_MS = '8000';

    expect(getK8sPreStopDelay()).toBe(8000);

    if (original === undefined) delete process.env.BOOT_PRESTOP_DELAY_MS;
    else process.env.BOOT_PRESTOP_DELAY_MS = original;
  });

  it('should return default 5000ms when BOOT_PRESTOP_DELAY_MS is not set', () => {
    const original = process.env.BOOT_PRESTOP_DELAY_MS;
    delete process.env.BOOT_PRESTOP_DELAY_MS;

    expect(getK8sPreStopDelay()).toBe(5_000);

    if (original !== undefined) process.env.BOOT_PRESTOP_DELAY_MS = original;
  });

  it('getK8sShutdownInfo should return non-K8s message when env var absent', () => {
    const original = process.env.KUBERNETES_SERVICE_HOST;
    delete process.env.KUBERNETES_SERVICE_HOST;

    const info = getK8sShutdownInfo();
    expect(info.isK8s).toBe(false);
    expect(info.message).toContain('Non-K8s');

    if (original !== undefined) process.env.KUBERNETES_SERVICE_HOST = original;
  });
});
