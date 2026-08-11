import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Module from 'module';
import { Test } from '@nestjs/testing';
import { TracingService } from '../../src/tracing/tracing.service';
import { TracingModule } from '../../src/tracing/tracing.module';
import { initTracing } from '../../src/tracing/init-tracing';
import * as correlationStorage from '../../src/correlation/correlation.storage';

// -------------------------------------------------------
// 1. initTracing does not crash when OTel packages missing
// -------------------------------------------------------
describe('initTracing', () => {
  it('does not crash when @opentelemetry/sdk-node is not installed', () => {
    // Mock require to throw for OTel packages (simulate not installed)
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const originalRequire = Module.prototype.require;
    const mockRequire = function (this: any, id: string) {
      if (id.includes('@opentelemetry')) {
        throw new Error(`Cannot find module '${id}'`);
      }
      return originalRequire.call(this, id);
    };
    Module.prototype.require = mockRequire as any;

    try {
      expect(() =>
        initTracing({ exporter: 'console' }),
      ).not.toThrow();

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('not installed'),
      );
    } finally {
      Module.prototype.require = originalRequire;
      warnSpy.mockRestore();
    }
  });

  it('returns immediately when enabled is false', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(() =>
      initTracing({ enabled: false, exporter: 'console' }),
    ).not.toThrow();

    // Should NOT warn — it just returns early
    expect(warnSpy).not.toHaveBeenCalled();

    warnSpy.mockRestore();
  });
});

// -------------------------------------------------------
// 2–4. TracingService tests with mocked OTel API
// -------------------------------------------------------
describe('TracingService', () => {
  let service: TracingService;
  let mockSpan: any;
  let mockTracer: any;
  let mockApi: any;

  beforeEach(async () => {
    mockSpan = {
      setAttribute: vi.fn(),
      setStatus: vi.fn(),
      recordException: vi.fn(),
      end: vi.fn(),
    };

    mockTracer = {
      startActiveSpan: vi.fn((name: string, fn: (span: any) => any) => fn(mockSpan)),
    };

    mockApi = {
      trace: {
        getTracer: vi.fn(() => mockTracer),
        getActiveSpan: vi.fn(() => mockSpan),
      },
      SpanStatusCode: { ERROR: 2 },
    };

    const moduleRef = await Test.createTestingModule({
      imports: [TracingModule.register({ exporter: 'console' })],
    }).compile();

    service = moduleRef.get(TracingService);
    // Override the private api field with our mock
    (service as any).api = mockApi;
  });

  it('startSpan creates and ends span', async () => {
    const result = await service.startSpan('test-span', (span) => {
      expect(span).toBeDefined();
      return 42;
    });

    expect(result).toBe(42);
    expect(mockTracer.startActiveSpan).toHaveBeenCalledWith('test-span', expect.any(Function));
    expect(mockSpan.end).toHaveBeenCalled();
  });

  it('startSpan records exception on error', async () => {
    const error = new Error('boom');

    await expect(
      service.startSpan('fail-span', () => {
        throw error;
      }),
    ).rejects.toThrow('boom');

    expect(mockSpan.recordException).toHaveBeenCalledWith(error);
    expect(mockSpan.setStatus).toHaveBeenCalledWith({
      code: 2,
      message: 'boom',
    });
    expect(mockSpan.end).toHaveBeenCalled();
  });

  it('addAttribute sets attribute on active span', () => {
    service.addAttribute('user.id', '123');

    expect(mockApi.trace.getActiveSpan).toHaveBeenCalled();
    expect(mockSpan.setAttribute).toHaveBeenCalledWith('user.id', '123');
  });

  it('recordException records error on active span', () => {
    const error = new Error('test error');
    service.recordException(error);

    expect(mockSpan.recordException).toHaveBeenCalledWith(error);
    expect(mockSpan.setStatus).toHaveBeenCalledWith({
      code: 2,
      message: 'test error',
    });
  });

  it('injects correlationId into span attributes automatically', async () => {
    // Mock getCorrelationId to return a value
    vi.spyOn(correlationStorage, 'getCorrelationId').mockReturnValue('corr-abc-123');

    await service.startSpan('corr-span', () => 'ok');

    expect(mockSpan.setAttribute).toHaveBeenCalledWith('correlation.id', 'corr-abc-123');
  });

  it('no-ops gracefully when api is null (packages missing)', async () => {
    (service as any).api = null;

    // None of these should throw
    const result = await service.startSpan('noop', () => 'value');
    expect(result).toBe('value');

    expect(service.getActiveSpan()).toBeUndefined();

    expect(() => service.addAttribute('key', 'val')).not.toThrow();
    expect(() => service.recordException(new Error('x'))).not.toThrow();
  });
});
