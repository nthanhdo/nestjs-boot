import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { catchError, Observable, throwError } from 'rxjs';
import { getCorrelationId } from '../correlation/correlation.storage';

/**
 * Shape of a serialized RPC error forwarded by a downstream service.
 * Matches the standard NestJS microservice error envelope.
 */
interface RpcErrorEnvelope {
  /** Human-readable error message */
  message?: string;
  /** Application-defined error code (e.g. 'ORDER_NOT_FOUND') */
  code?: string;
  /** Originating service name (set by ErrorContextInterceptor on the producer) */
  service?: string;
  /** Correlation ID chain at the time of the error */
  correlationId?: string;
  /** Upstream services already in the chain */
  upstreamChain?: string[];
  /** Stack trace (stripped in production) */
  stack?: string;
  /** Original status code (HTTP mapping) */
  status?: number;
}

export class BootRpcException extends Error {
  constructor(
    message: string,
    public readonly code: string = 'RPC_ERROR',
    public readonly context: {
      service?: string;
      correlationId?: string;
      upstreamChain?: string[];
      status?: number;
    } = {},
  ) {
    super(message);
    this.name = 'BootRpcException';
  }
}

/**
 * Options for `ErrorContextInterceptor`.
 */
export interface ErrorContextOptions {
  /**
   * Name of THIS service — added to the error context so downstream callers
   * know which service originated or last handled the error.
   */
  serviceName: string;

  /**
   * Whether to include stack traces in re-thrown errors.
   * Disable in production.
   *
   * @default false
   */
  includeStack?: boolean;
}

/**
 * `ErrorContextInterceptor` — preserves inter-service error context across RPC hops.
 *
 * When a `ServiceClient` call to a downstream service fails:
 *
 * 1. Deserializes the RPC error envelope (NestJS standard format).
 * 2. Attaches the current correlation ID to the error context.
 * 3. Appends THIS service's name to the `upstreamChain` so the call path is
 *    visible in logs / error reports.
 * 4. Re-throws as a `BootRpcException` with a structured context block —
 *    eliminating the need to parse raw RPC error strings.
 *
 * ## Registration (globally, in main.ts)
 *
 * ```ts
 * const app = await NestFactory.create(AppModule);
 * app.useGlobalInterceptors(
 *   new ErrorContextInterceptor({ serviceName: 'order-service' }),
 * );
 * ```
 *
 * ## Or per-module via providers
 *
 * ```ts
 * providers: [
 *   {
 *     provide: APP_INTERCEPTOR,
 *     useValue: new ErrorContextInterceptor({ serviceName: 'order-service' }),
 *   },
 * ],
 * ```
 *
 * ## What the caller receives
 *
 * ```ts
 * try {
 *   await orderClient.call('findOrder', { id: '123' });
 * } catch (err) {
 *   if (err instanceof BootRpcException) {
 *     console.log(err.code);                    // 'ORDER_NOT_FOUND'
 *     console.log(err.context.service);         // 'order-service'
 *     console.log(err.context.upstreamChain);   // ['api-gateway', 'order-service']
 *     console.log(err.context.correlationId);   // 'corr-abc-123'
 *   }
 * }
 * ```
 */
@Injectable()
export class ErrorContextInterceptor implements NestInterceptor {
  private readonly logger = new Logger(ErrorContextInterceptor.name);

  constructor(private readonly options: ErrorContextOptions) {}

  intercept(_context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      catchError((err: unknown) => {
        const enriched = this.enrich(err);
        return throwError(() => enriched);
      }),
    );
  }

  // ── private ──────────────────────────────────────────────────────────────────

  private enrich(raw: unknown): BootRpcException | unknown {
    const correlationId = getCorrelationId();
    const serviceName = this.options.serviceName;

    // Already a BootRpcException from a prior hop — extend the chain
    if (raw instanceof BootRpcException) {
      const chain = [...(raw.context.upstreamChain ?? [])];
      if (!chain.includes(serviceName)) {
        chain.push(serviceName);
      }
      return new BootRpcException(raw.message, raw.code, {
        ...raw.context,
        correlationId: raw.context.correlationId ?? correlationId,
        upstreamChain: chain,
      });
    }

    // NestJS RPC error envelope (plain object with message/code/status)
    if (this.isRpcEnvelope(raw)) {
      const envelope = raw as RpcErrorEnvelope;
      const chain = [...(envelope.upstreamChain ?? [])];
      if (!chain.includes(serviceName)) {
        chain.push(serviceName);
      }

      const ex = new BootRpcException(
        envelope.message ?? 'RPC call failed',
        envelope.code ?? 'RPC_ERROR',
        {
          service: envelope.service ?? serviceName,
          correlationId: envelope.correlationId ?? correlationId,
          upstreamChain: chain,
          status: envelope.status,
        },
      );

      if (this.options.includeStack && envelope.stack) {
        ex.stack = envelope.stack;
      }

      this.logger.error(
        `RPC error from ${ex.context.service} [corr=${ex.context.correlationId}] ` +
          `code=${ex.code} chain=[${ex.context.upstreamChain?.join(' → ')}]: ${ex.message}`,
      );

      return ex;
    }

    // Standard Error — wrap minimally
    if (raw instanceof Error) {
      return new BootRpcException(raw.message, 'RPC_ERROR', {
        service: serviceName,
        correlationId,
        upstreamChain: [serviceName],
      });
    }

    // Unknown shape — pass through unchanged
    return raw;
  }

  private isRpcEnvelope(value: unknown): boolean {
    return (
      typeof value === 'object' &&
      value !== null &&
      ('message' in value || 'code' in value || 'status' in value)
    );
  }
}
