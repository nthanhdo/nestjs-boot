import { firstValueFrom } from 'rxjs';
import { withCorrelationId } from '../correlation/correlation.interceptor';

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
    const payload = metadata.correlationId
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
      const payload = metadata.correlationId
        ? { ...data, __metadata: metadata }
        : data;
      client.emit(event, payload);
    }
  }
}
