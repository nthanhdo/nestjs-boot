import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { getCorrelationId } from './correlation.storage';
import { CORRELATION_HEADER } from './constants';

/**
 * CorrelationInterceptor — auto-attaches the current correlationId
 * to outgoing ClientProxy calls (RPC metadata) and HTTP responses.
 *
 * For outgoing RPC calls via ClientProxy, the correlationId is injected
 * into the message metadata so downstream services can continue the trace.
 *
 * Register globally or per-controller:
 * ```ts
 * app.useGlobalInterceptors(new CorrelationInterceptor());
 * ```
 */
@Injectable()
export class CorrelationInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const correlationId = getCorrelationId();

    if (!correlationId) {
      return next.handle();
    }

    // For HTTP context, ensure correlation ID is in response headers
    if (context.getType() === 'http') {
      const response = context.switchToHttp().getResponse();
      if (response && typeof response.setHeader === 'function') {
        response.setHeader(CORRELATION_HEADER, correlationId);
      }
    }

    return next.handle();
  }
}

/**
 * Inject correlation ID into ClientProxy metadata.
 * Use this when manually constructing ClientProxy.send() calls:
 *
 * ```ts
 * const metadata = withCorrelationId({});
 * this.client.send('pattern', { data, metadata });
 * ```
 */
export function withCorrelationId(
  metadata: Record<string, any> = {},
): Record<string, any> {
  const correlationId = getCorrelationId();
  if (correlationId) {
    return { ...metadata, correlationId };
  }
  return metadata;
}
