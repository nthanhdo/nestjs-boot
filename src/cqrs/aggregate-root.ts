import { DomainEvent, StoredEvent } from './domain-event';

/**
 * AggregateRoot — the DDD building block for event-sourced aggregates.
 *
 * Aggregates accumulate state by applying domain events. Events are
 * collected as "uncommitted" until the repository persists them to the
 * event store. The aggregate can be reconstituted from its event history.
 *
 * @example
 * ```ts
 * class Order extends AggregateRoot {
 *   private status = 'draft';
 *   private total = 0;
 *
 *   static create(id: string, total: number): Order {
 *     const order = new Order();
 *     order.apply(new OrderCreatedEvent(id, total));
 *     return order;
 *   }
 *
 *   ship(): void {
 *     if (this.status !== 'confirmed') throw new Error('Cannot ship');
 *     this.apply(new OrderShippedEvent(this.id));
 *   }
 *
 *   applyEvent(event: DomainEvent): void {
 *     if (event instanceof OrderCreatedEvent) {
 *       this.status = 'created';
 *       this.total = event.total;
 *     } else if (event instanceof OrderShippedEvent) {
 *       this.status = 'shipped';
 *     }
 *   }
 * }
 * ```
 */
export abstract class AggregateRoot {
  private uncommittedEvents: DomainEvent[] = [];
  private version = 0;

  /**
   * Apply a new domain event to this aggregate.
   * The event is added to the uncommitted list AND applied to current state.
   */
  protected apply(event: DomainEvent): void {
    this.uncommittedEvents.push(event);
    this.applyEvent(event);
    this.version++;
  }

  /**
   * Apply a domain event to update aggregate state.
   * Subclasses implement this as a pure state transition (no side effects).
   */
  abstract applyEvent(event: DomainEvent): void;

  /**
   * Get all events that haven't been persisted yet.
   */
  getUncommittedEvents(): DomainEvent[] {
    return [...this.uncommittedEvents];
  }

  /**
   * Clear uncommitted events after they've been persisted to the event store.
   */
  clearUncommittedEvents(): void {
    this.uncommittedEvents = [];
  }

  /**
   * Get the current version of this aggregate (number of events applied).
   */
  getVersion(): number {
    return this.version;
  }

  /**
   * Rebuild aggregate state from a sequence of stored events.
   * Used when loading an aggregate from the event store.
   *
   * @param events - Historical events from the event store, in version order
   */
  loadFromHistory(events: StoredEvent[]): void {
    for (const event of events) {
      this.applyEvent(event as unknown as DomainEvent);
      this.version = event.version;
    }
  }

  /**
   * Rebuild aggregate state from a snapshot + remaining events.
   *
   * @param snapshot - The aggregate state at a point in time
   * @param events - Events that occurred after the snapshot
   */
  loadFromSnapshot(snapshot: { version: number; state: unknown }, events: StoredEvent[]): void {
    this.restoreFromSnapshot(snapshot.state);
    this.version = snapshot.version;
    for (const event of events) {
      this.applyEvent(event as unknown as DomainEvent);
      this.version = event.version;
    }
  }

  /**
   * Override to restore aggregate state from a snapshot payload.
   * Only needed when using SnapshotStore.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  protected restoreFromSnapshot(_state: unknown): void {
    // Default: no-op. Override in subclass if using snapshots.
  }

  /**
   * Override to produce a snapshot of current aggregate state.
   * Only needed when using SnapshotStore.
   */
  protected toSnapshot(): unknown {
    return {};
  }
}
