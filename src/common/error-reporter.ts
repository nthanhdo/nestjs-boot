/**
 * error-reporter.ts — pluggable error monitoring integration.
 *
 * Wire into AllExceptionsFilter and BootRpcExceptionFilter to forward errors
 * to Sentry, Datadog, Honeybadger, or any custom sink — without subclassing.
 *
 * Usage (in main.ts or AppModule):
 * ```ts
 * import * as Sentry from '@sentry/node';
 * import { ErrorReporter } from '@nestjs-boot/common';
 *
 * ErrorReporter.configure({
 *   onError: (error, ctx) => Sentry.captureException(error, { extra: ctx }),
 *   filter: (error) => !(error instanceof NotFoundException), // skip 404s
 *   enrichContext: (ctx) => ({ ...ctx, environment: process.env.NODE_ENV }),
 * });
 * ```
 */

export interface ErrorContext {
  statusCode: number;
  path: string;
  method: string;
  correlationId?: string;
  traceId?: string;
  userId?: string;
  service?: string;
  contextType: 'http' | 'rpc' | 'ws';
  timestamp: string;
}

export interface ErrorReporterOptions {
  /**
   * Called for every caught error (after `filter` passes).
   * Async-safe — errors thrown here are swallowed so the reporter never
   * crashes the filter.
   */
  onError: (error: Error, context: ErrorContext) => void | Promise<void>;

  /**
   * Optional predicate — return `false` to skip reporting this error.
   * Useful to suppress 404s, healthcheck timeouts, etc.
   * Default: report everything.
   */
  filter?: (error: Error) => boolean;

  /**
   * Optional context enricher — add custom fields (env, tenant, feature-flag)
   * before forwarding to `onError`.
   */
  enrichContext?: (context: ErrorContext) => ErrorContext;
}

/**
 * Singleton error reporter — configure once, used by all filters.
 */
export class ErrorReporter {
  private static options: ErrorReporterOptions | undefined;

  /** Register the monitoring integration. Call once at application startup. */
  static configure(options: ErrorReporterOptions): void {
    ErrorReporter.options = options;
  }

  /** Reset configuration (useful in tests). */
  static reset(): void {
    ErrorReporter.options = undefined;
  }

  /**
   * Report an error. Called internally by filters.
   *
   * @param error - The caught error instance.
   * @param context - Partial context built by the filter; missing fields use
   *                  safe defaults.
   */
  static async report(
    error: unknown,
    context: Partial<ErrorContext>,
  ): Promise<void> {
    if (!ErrorReporter.options) return;
    if (!(error instanceof Error)) return;

    const { onError, filter, enrichContext } = ErrorReporter.options;

    // Apply filter
    if (filter && !filter(error)) return;

    // Build full context with safe defaults
    let ctx: ErrorContext = {
      statusCode: context.statusCode ?? 500,
      path: context.path ?? '',
      method: context.method ?? '',
      correlationId: context.correlationId,
      traceId: context.traceId ?? ErrorReporter.extractTraceId(),
      userId: context.userId,
      service: context.service,
      contextType: context.contextType ?? 'http',
      timestamp: context.timestamp ?? new Date().toISOString(),
    };

    // Enrich
    if (enrichContext) {
      try {
        ctx = enrichContext(ctx);
      } catch {
        // Enricher errors must never propagate
      }
    }

    // Report — swallow errors so monitoring never crashes the request
    try {
      await onError(error, ctx);
    } catch {
      // noop
    }
  }

  /**
   * Extract OpenTelemetry trace ID from the active span if available.
   * Falls back to undefined when OTel is not installed.
   */
  private static extractTraceId(): string | undefined {
    try {
      // Dynamic import so there is no hard OTel dependency at compile time
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const api = require('@opentelemetry/api') as typeof import('@opentelemetry/api');
      const span = api.trace.getActiveSpan();
      if (!span) return undefined;
      const ctx = span.spanContext();
      return ctx.traceId || undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Extract userId from an HTTP request object if `request.user` is present.
   * Handles both `{ id }` and `{ userId }` shapes.
   */
  static extractUserId(request: unknown): string | undefined {
    if (!request || typeof request !== 'object') return undefined;
    const user = (request as Record<string, unknown>).user;
    if (!user || typeof user !== 'object') return undefined;
    const u = user as Record<string, unknown>;
    const id = u.id ?? u.userId ?? u.sub;
    return id != null ? String(id) : undefined;
  }
}
