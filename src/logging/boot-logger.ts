import { LoggerService } from '@nestjs/common';
import { getCorrelationId } from '../correlation/correlation.storage';
import { LoggingOptions } from './interfaces';
import { buildLogContext } from './log-context';

let pinoFactory: ((opts?: any) => any) | undefined;
let hasPinoPretty = false;
try {
  const pinoMod = require('pino');
  pinoFactory = pinoMod.default ?? pinoMod;
} catch {
  // pino not installed — fallback to console
}
try {
  require('pino-pretty');
  hasPinoPretty = true;
} catch {
  // pino-pretty not installed — no pretty printing
}

/**
 * BootLogger — NestJS LoggerService backed by pino.
 * Falls back to console if pino is not installed.
 * Auto-injects correlationId from AsyncLocalStorage.
 */
export class BootLogger implements LoggerService {
  private readonly pinoInstance: any;
  private readonly useFallback: boolean;
  private readonly staticContext: Record<string, unknown>;

  constructor(options: LoggingOptions = {}) {
    // Build static context once — auto-populated + user overrides
    this.staticContext = buildLogContext(options.context);

    if (!pinoFactory) {
      this.useFallback = true;
      return;
    }
    this.useFallback = false;

    const isProd = process.env.NODE_ENV === 'production';
    const pretty = options.pretty ?? !isProd;

    const pinoOptions: any = {
      level: options.level ?? 'info',
    };

    if (options.redact?.length) {
      pinoOptions.redact = options.redact;
    }

    if (pretty && hasPinoPretty) {
      pinoOptions.transport = {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'SYS:standard' },
      };
    }

    this.pinoInstance = pinoFactory(pinoOptions);
  }

  private getTraceId(): string | undefined {
    try {
      // Try to read traceId from OpenTelemetry active span if available
      const otelApi = require('@opentelemetry/api');
      const activeSpan = otelApi.trace.getActiveSpan?.();
      if (activeSpan) {
        const spanContext = activeSpan.spanContext?.();
        if (spanContext?.traceId) {
          return spanContext.traceId;
        }
      }
    } catch {
      // @opentelemetry/api not installed — no traceId
    }
    return undefined;
  }

  private buildPayload(context?: string): Record<string, unknown> {
    // Start with static context (service, environment, version, user extras)
    const payload: Record<string, unknown> = { ...this.staticContext };
    const correlationId = getCorrelationId();
    if (correlationId) {
      payload.correlationId = correlationId;
    }
    const traceId = this.getTraceId();
    if (traceId) {
      payload.traceId = traceId;
    }
    if (context) {
      payload.context = context;
    }
    return payload;
  }

  log(message: any, context?: string): void {
    if (this.useFallback) {
      console.log(JSON.stringify({ level: 'info', msg: message, ...this.buildPayload(context) }));
      return;
    }
    this.pinoInstance.info(this.buildPayload(context), message);
  }

  error(message: any, trace?: string, context?: string): void {
    if (this.useFallback) {
      console.error(JSON.stringify({ level: 'error', msg: message, trace, ...this.buildPayload(context) }));
      return;
    }
    this.pinoInstance.error({ ...this.buildPayload(context), trace }, message);
  }

  warn(message: any, context?: string): void {
    if (this.useFallback) {
      console.warn(JSON.stringify({ level: 'warn', msg: message, ...this.buildPayload(context) }));
      return;
    }
    this.pinoInstance.warn(this.buildPayload(context), message);
  }

  debug(message: any, context?: string): void {
    if (this.useFallback) {
      console.debug(JSON.stringify({ level: 'debug', msg: message, ...this.buildPayload(context) }));
      return;
    }
    this.pinoInstance.debug(this.buildPayload(context), message);
  }

  verbose(message: any, context?: string): void {
    if (this.useFallback) {
      console.log(JSON.stringify({ level: 'trace', msg: message, ...this.buildPayload(context) }));
      return;
    }
    this.pinoInstance.trace(this.buildPayload(context), message);
  }

  fatal(message: any, context?: string): void {
    if (this.useFallback) {
      console.error(JSON.stringify({ level: 'fatal', msg: message, ...this.buildPayload(context) }));
      return;
    }
    this.pinoInstance.fatal(this.buildPayload(context), message);
  }

  /**
   * Get the underlying pino instance (or undefined if not available).
   */
  getPinoInstance(): any {
    return this.pinoInstance;
  }
}
