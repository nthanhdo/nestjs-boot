import { firstValueFrom } from 'rxjs';
import { withCorrelationId } from '../correlation/correlation.interceptor';
import { getAuthContext } from '../inter-service-auth/auth-context.storage';

/**
 * Typed service client wrapper around NestJS ClientProxy.
 *
 * Provides type-safe inter-service calls with auto-correlation ID forwarding.
 *
 * ```ts
 * // Define the remote service interface
 * interface OrderService {
 *   createOrder(data: CreateOrderDto): OrderResponseDto;
 *   getOrder(data: { id: string }): OrderResponseDto;
 * }
 *
 * // Create a typed client
 * const orderClient = new ServiceClient<OrderService>(clientProxy);
 *
 * // Type-safe calls with autocomplete
 * const order = await orderClient.call('createOrder', { items: [...] });
 * const found = await orderClient.call('getOrder', { id: '123' });
 * ```
 */
export class ServiceClient<T extends Record<string, (...args: any[]) => any>> {
  constructor(private readonly client: { send: (pattern: any, data: any) => any }) {}

  /**
   * Call a remote service method with type safety.
   * Auto-includes correlationId in the message metadata.
   */
  async call<K extends keyof T & string>(
    method: K,
    data: Parameters<T[K]>[0],
  ): Promise<ReturnType<T[K]>> {
    const metadata = withCorrelationId({});

    // Auto-forward auth headers from ALS context
    this.injectAuthMetadata(metadata);

    const hasMetadata = metadata.correlationId || metadata.authorization || metadata.apiKey;
    const payload = hasMetadata
      ? { ...data, __metadata: metadata }
      : data;

    return firstValueFrom(this.client.send(method, payload)) as Promise<ReturnType<T[K]>>;
  }

  /**
   * Emit an event (fire-and-forget) to a remote service.
   */
  emit<K extends keyof T & string>(
    event: K,
    data: Parameters<T[K]>[0],
  ): void {
    const client = this.client as any;
    if (typeof client.emit === 'function') {
      const metadata = withCorrelationId({});

      // Auto-forward auth headers from ALS context
      this.injectAuthMetadata(metadata);

      const hasMetadata = metadata.correlationId || metadata.authorization || metadata.apiKey;
      const payload = hasMetadata
        ? { ...data, __metadata: metadata }
        : data;
      client.emit(event, payload);
    }
  }

  /** @internal — inject auth context from ALS into metadata */
  private injectAuthMetadata(metadata: Record<string, any>): void {
    try {
      const authCtx = getAuthContext();
      if (authCtx?.token) {
        metadata.authorization = authCtx.token;
      }
      if (authCtx?.apiKey) {
        metadata.apiKey = authCtx.apiKey;
      }
    } catch {
      // inter-service-auth module not configured — skip silently
    }
  }
}
