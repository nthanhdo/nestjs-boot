import { SetMetadata } from '@nestjs/common';
import { ON_EVENT_METADATA } from './constants';
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
