import { Injectable, Logger } from '@nestjs/common';
import { getCorrelationId } from '../correlation/correlation.storage';

/**
 * TracingService — convenience wrapper for manual span creation.
 *
 * All operations gracefully no-op if @opentelemetry/api is not installed.
 */
@Injectable()
export class TracingService {
  private readonly logger = new Logger(TracingService.name);
  private api: any;

  constructor() {
    try {
      this.api = require('@opentelemetry/api');
    } catch {
      this.logger.warn(
        '@opentelemetry/api not installed — TracingService methods will no-op.',
      );
      this.api = null;
    }
  }

  /**
   * Create a span, run the function within it, and end the span.
   * Automatically attaches correlationId as an attribute.
   */
  async startSpan<T>(name: string, fn: (span?: any) => T | Promise<T>): Promise<T> {
    if (!this.api) return fn(undefined);

    const tracer = this.api.trace.getTracer('nestjs-boot');
    return tracer.startActiveSpan(name, async (span: any) => {
      try {
        const correlationId = getCorrelationId();
        if (correlationId) {
          span.setAttribute('correlation.id', correlationId);
        }
        const result = await fn(span);
        return result;
      } catch (err) {
        if (span && err instanceof Error) {
          span.recordException(err);
          span.setStatus({ code: this.api.SpanStatusCode.ERROR, message: err.message });
        }
        throw err;
      } finally {
        span.end();
      }
    });
  }

  /**
   * Get the currently active span, or undefined.
   */
  getActiveSpan(): any | undefined {
    if (!this.api) return undefined;
    return this.api.trace.getActiveSpan();
  }

  /**
   * Add an attribute to the currently active span.
   */
  addAttribute(key: string, value: string | number | boolean): void {
    if (!this.api) return;
    const span = this.api.trace.getActiveSpan();
    if (span) {
      span.setAttribute(key, value);
    }
  }

  /**
   * Record an exception on the currently active span.
   */
  recordException(error: Error): void {
    if (!this.api) return;
    const span = this.api.trace.getActiveSpan();
    if (span) {
      span.recordException(error);
      span.setStatus({ code: this.api.SpanStatusCode.ERROR, message: error.message });
    }
  }
}
