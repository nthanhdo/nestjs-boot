import { Type } from '@nestjs/common';
import { DomainEvent } from './domain-event';

/** Metadata keys */
export const PROJECTION_METADATA = 'CQRS_PROJECTION';
export const ON_DOMAIN_EVENT_METADATA = 'CQRS_ON_DOMAIN_EVENT';

/**
 * Marks a class as an event projection that builds read models from domain events.
 *
 * @param name - Unique name for this projection (used for tracking replay position)
 *
 * @example
 * ```ts
 * @Projection('order-summary')
 * class OrderSummaryProjection {
 *   @OnDomainEvent(OrderCreatedEvent)
 *   async onOrderCreated(event: OrderCreatedEvent) {
 *     await this.db.collection('order_summaries').insertOne({
 *       orderId: event.orderId,
 *       status: 'created',
 *       total: event.total,
 *     });
 *   }
 *
 *   @OnDomainEvent(OrderShippedEvent)
 *   async onOrderShipped(event: OrderShippedEvent) {
 *     await this.db.collection('order_summaries').updateOne(
 *       { orderId: event.orderId },
 *       { $set: { status: 'shipped' } },
 *     );
 *   }
 * }
 * ```
 */
export function Projection(name: string): ClassDecorator {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (target: any) => {
    Reflect.defineMetadata(PROJECTION_METADATA, name, target);
    return target;
  };
}

/**
 * Marks a method as a handler for a specific domain event type within a Projection.
 *
 * Accepts either a DomainEvent class or a type string.
 * - Class form: `@OnDomainEvent(OrderCreatedEvent)` — matches by class name
 * - String form: `@OnDomainEvent('OrderCreated')` — matches stored event `type` field directly
 *
 * When using event sourcing, prefer the string form since stored events use the
 * `type` field (e.g. "OrderCreated"), not the class name (e.g. "OrderCreatedEvent").
 *
 * @param eventTypeOrString - A DomainEvent subclass or event type string
 */
export function OnDomainEvent(eventTypeOrString: Type<DomainEvent> | string): MethodDecorator {
  return (target, propertyKey, descriptor) => {
    const eventTypeName = typeof eventTypeOrString === 'string'
      ? eventTypeOrString
      : eventTypeOrString.name;

    const existing = Reflect.getMetadata(ON_DOMAIN_EVENT_METADATA, target) ?? [];
    existing.push({ eventTypeName, methodName: propertyKey });
    Reflect.defineMetadata(ON_DOMAIN_EVENT_METADATA, existing, target);
    return descriptor;
  };
}
