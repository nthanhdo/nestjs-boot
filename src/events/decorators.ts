import { SetMetadata } from '@nestjs/common';
import { ON_EVENT_METADATA, ON_QUERY_METADATA } from './constants';
import { OnEventOptions } from './interfaces';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EventClass = new (...args: any[]) => any;

/**
 * Marks a method as an event handler for the given event class.
 *
 * Usage:
 * ```ts
 * @OnEvent(OrderCreatedEvent)
 * handleOrderCreated(event: OrderCreatedEvent) { ... }
 *
 * @OnEvent(OrderCreatedEvent, { async: true })
 * handleAsync(event: OrderCreatedEvent) { ... }
 * ```
 */
export function OnEvent(eventClass: EventClass, options?: OnEventOptions): MethodDecorator {
  return SetMetadata(ON_EVENT_METADATA, { eventClass, options: options ?? {} });
}

/**
 * Marks a method as a query handler (request/reply pattern).
 *
 * Only ONE handler per query class is allowed. The method's return value
 * is sent back to the caller via `eventBus.emitAndWait()`.
 *
 * This is the key decorator for breaking circular dependencies when
 * you need a return value from another module.
 *
 * Usage:
 * ```ts
 * // In UserModule — no import of OrderModule needed
 * @OnQuery(GetUserByIdQuery)
 * async handleGetUser(query: GetUserByIdQuery): Promise<User> {
 *   return this.userService.findById(query.userId);
 * }
 * ```
 */
export function OnQuery(queryClass: EventClass): MethodDecorator {
  return SetMetadata(ON_QUERY_METADATA, { queryClass });
}
