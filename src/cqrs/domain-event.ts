/**
 * Base class for all domain events in the CQRS/Event Sourcing system.
 *
 * Domain events represent facts that happened in the domain — they are
 * immutable, past-tense records of state changes. Unlike BootEvent (which
 * is for in-process pub/sub), DomainEvent is designed for persistence
 * in an event store and replay through projections.
 *
 * @example
 * ```ts
 * class OrderCreatedEvent extends DomainEvent {
 *   readonly type = 'OrderCreated';
 *   constructor(
 *     public readonly orderId: string,
 *     public readonly total: number,
 *   ) { super(); }
 * }
 * ```
 */
export abstract class DomainEvent {
  readonly occurredAt = new Date();
  readonly correlationId?: string;
  abstract readonly type: string;

  constructor() {
    try {
      const { getCorrelationId } = require('../correlation/correlation.storage');
      this.correlationId = getCorrelationId();
    } catch {
      // correlation module not loaded — skip
    }
  }
}

/**
 * A domain event as persisted in the event store.
 * Adds stream context, version, and global position.
 */
export interface StoredEvent {
  /** Aggregate/stream identifier (e.g. "Order-abc123") */
  streamId: string;
  /** Per-stream version number (1-based, monotonically increasing) */
  version: number;
  /** Event type discriminator (e.g. "OrderCreated") */
  type: string;
  /** Serialized event payload */
  data: Record<string, unknown>;
  /** Event metadata for tracing and causation chains */
  metadata: {
    correlationId?: string;
    causationId?: string;
    timestamp: Date;
  };
  /** Global position across all streams (for ordered replay) */
  position: number;
}
