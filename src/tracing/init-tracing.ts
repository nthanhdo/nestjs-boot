import { TracingOptions } from './interfaces';

/**
 * Initialize OpenTelemetry tracing SDK.
 *
 * MUST be called BEFORE NestFactory.create() — OTel SDK patches
 * HTTP/gRPC/Mongo/Redis modules at import time, so the SDK must
 * be running before those modules load.
 *
 * All @opentelemetry/* packages are optional. If not installed,
 * logs a warning and returns silently (no crash).
 */
/** @internal — track whether NestFactory has been invoked */
let _nestFactoryInvoked = false;

/** @internal — called by createApp to mark NestFactory as invoked */
export function markNestFactoryInvoked(): void {
  _nestFactoryInvoked = true;
}

export function initTracing(options: TracingOptions): void {
  if (options.enabled === false) return;

  // Init-order guard: warn if NestFactory was already called
  if (_nestFactoryInvoked) {
    console.warn(
      '[nestjs-boot] WARNING: initTracing() called AFTER NestFactory.create(). ' +
        'OTel SDK must initialize BEFORE NestFactory to properly instrument HTTP/gRPC/DB modules. ' +
        'If you see missing spans, this is likely the cause. ' +
        'When using createApp(), this is handled automatically.',
    );
  }

  let NodeSDK: any;
  try {
    NodeSDK = require('@opentelemetry/sdk-node').NodeSDK;
  } catch {
    console.warn(
      '[nestjs-boot] @opentelemetry/sdk-node not installed — tracing disabled. ' +
        'Install it to enable OpenTelemetry tracing.',
    );
    return;
  }

  const exporter = createExporter(options);
  if (!exporter) return;

  const instrumentations = loadAutoInstrumentations();

  const sdk = new NodeSDK({
    traceExporter: exporter,
    instrumentations,
    serviceName: options.serviceName || readServiceName(),
    ...(options.sampleRate !== undefined
      ? { sampler: createSampler(options.sampleRate) }
      : {}),
  });

  sdk.start();

  // Graceful shutdown
  const shutdown = () => {
    sdk.shutdown().catch((err: Error) =>
      console.error('[nestjs-boot] OTel SDK shutdown error:', err),
    );
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

function createExporter(options: TracingOptions): unknown | null {
  try {
    switch (options.exporter) {
      case 'otlp': {
        const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
        return new OTLPTraceExporter({ url: options.endpoint });
      }
      case 'jaeger': {
        const { JaegerExporter } = require('@opentelemetry/exporter-jaeger');
        return new JaegerExporter({ endpoint: options.endpoint });
      }
      case 'zipkin': {
        const { ZipkinExporter } = require('@opentelemetry/exporter-zipkin');
        return new ZipkinExporter({ url: options.endpoint });
      }
      case 'console': {
        const { ConsoleSpanExporter } = require('@opentelemetry/sdk-trace-base');
        return new ConsoleSpanExporter();
      }
      default:
        console.warn(`[nestjs-boot] Unknown tracing exporter: ${options.exporter}`);
        return null;
    }
  } catch (err) {
    console.warn(
      `[nestjs-boot] Failed to load exporter for '${options.exporter}' — ` +
        `install the required @opentelemetry package. Tracing disabled.`,
    );
    return null;
  }
}

function loadAutoInstrumentations(): unknown[] {
  try {
    const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
    return [getNodeAutoInstrumentations()];
  } catch {
    // Auto-instrumentations package not installed — proceed without
    return [];
  }
}

function createSampler(rate: number): unknown {
  try {
    const { TraceIdRatioBasedSampler } = require('@opentelemetry/sdk-trace-base');
    return new TraceIdRatioBasedSampler(rate);
  } catch {
    return undefined as any;
  }
}

function readServiceName(): string {
  try {
    const pkg = require(process.cwd() + '/package.json');
    return pkg.name || 'unknown-service';
  } catch {
    return 'unknown-service';
  }
}
