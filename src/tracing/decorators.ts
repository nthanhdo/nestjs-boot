import { getCorrelationId } from '../correlation/correlation.storage';

/**
 * @BootTrace('ServiceName.methodName') — method decorator that auto-creates
 * an OpenTelemetry span around the decorated method.
 *
 * If @opentelemetry/api is not installed, the decorator is a no-op passthrough.
 *
 * ```ts
 * @Injectable()
 * export class ProductService {
 *   @BootTrace('ProductService.findById')
 *   async findById(id: string) {
 *     return this.repo.findById(id);
 *   }
 *
 *   @BootTrace() // auto-generates name from class.method
 *   async findAll() { ... }
 * }
 * ```
 */
export function BootTrace(spanName?: string): MethodDecorator {
  return function (
    target: any,
    propertyKey: string | symbol,
    descriptor: TypedPropertyDescriptor<any>,
  ): TypedPropertyDescriptor<any> {
    const originalMethod = descriptor.value;
    const name = spanName ?? `${target.constructor?.name ?? 'Unknown'}.${String(propertyKey)}`;

    let api: any;
    try {
      api = require('@opentelemetry/api');
    } catch {
      // OTel not installed — return unmodified descriptor
      return descriptor;
    }

    descriptor.value = function (this: any, ...args: any[]) {
      const tracer = api.trace.getTracer('nestjs-boot');

      return tracer.startActiveSpan(name, (span: any) => {
        try {
          // Attach correlation ID if available
          const correlationId = getCorrelationId();
          if (correlationId) {
            span.setAttribute('correlation.id', correlationId);
          }

          const result = originalMethod.apply(this, args);

          // Handle async methods
          if (result && typeof result.then === 'function') {
            return result
              .then((res: any) => {
                span.end();
                return res;
              })
              .catch((err: any) => {
                if (err instanceof Error) {
                  span.recordException(err);
                  span.setStatus({
                    code: api.SpanStatusCode.ERROR,
                    message: err.message,
                  });
                }
                span.end();
                throw err;
              });
          }

          span.end();
          return result;
        } catch (err) {
          if (err instanceof Error) {
            span.recordException(err);
            span.setStatus({
              code: api.SpanStatusCode.ERROR,
              message: err.message,
            });
          }
          span.end();
          throw err;
        }
      });
    };

    return descriptor;
  };
}
