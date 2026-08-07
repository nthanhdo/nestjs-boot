import { describe, it, expect, beforeEach } from 'vitest';
import 'reflect-metadata';
import { MemoryEventStore } from '../../src/cqrs/adapters/memory-event-store';
import { EventReplayService } from '../../src/cqrs/event-replay.service';
import { Projection, OnDomainEvent } from '../../src/cqrs/decorators';
import { DomainEvent, StoredEvent } from '../../src/cqrs/domain-event';

class OrderCreatedEvent extends DomainEvent {
  readonly type = 'OrderCreated';
  constructor(public readonly orderId: string, public readonly total: number) { super(); }
}

class OrderShippedEvent extends DomainEvent {
  readonly type = 'OrderShipped';
  constructor(public readonly orderId: string) { super(); }
}

function makeStoredEvent(type: string, data: Record<string, unknown>): StoredEvent {
  return { streamId: '', version: 0, type, data, metadata: { timestamp: new Date() }, position: 0 };
}

@Projection('order-summary')
class OrderSummaryProjection {
  public summaries: Record<string, { status: string; total: number }> = {};

  @OnDomainEvent('OrderCreated')
  async onCreated(event: StoredEvent) {
    this.summaries[event.data.orderId as string] = {
      status: 'created',
      total: event.data.total as number,
    };
  }

  @OnDomainEvent('OrderShipped')
  async onShipped(event: StoredEvent) {
    if (this.summaries[event.data.orderId as string]) {
      this.summaries[event.data.orderId as string].status = 'shipped';
    }
  }
}

@Projection('order-count')
class OrderCountProjection {
  public count = 0;

  @OnDomainEvent('OrderCreated')
  async onCreated() {
    this.count++;
  }
}

describe('Projection + Replay', () => {
  let store: MemoryEventStore;
  let replayService: EventReplayService;

  beforeEach(() => {
    store = new MemoryEventStore();
    replayService = new EventReplayService(store);
  });

  it('projection receives domain events during replay', async () => {
    await store.append('Order-1', [
      makeStoredEvent('OrderCreated', { orderId: 'o1', total: 100 }),
    ]);
    await store.append('Order-1', [
      makeStoredEvent('OrderShipped', { orderId: 'o1' }),
    ]);

    const projection = new OrderSummaryProjection();
    const result = await replayService.replayAll([projection]);

    expect(result.eventsProcessed).toBe(2);
    expect(projection.summaries['o1']).toEqual({ status: 'shipped', total: 100 });
  });

  it('multiple projections for the same event type both receive it', async () => {
    await store.append('Order-1', [
      makeStoredEvent('OrderCreated', { orderId: 'o1', total: 50 }),
    ]);

    const summaryProj = new OrderSummaryProjection();
    const countProj = new OrderCountProjection();
    const result = await replayService.replayAll([summaryProj, countProj]);

    expect(result.eventsProcessed).toBe(1);
    expect(summaryProj.summaries['o1']).toBeDefined();
    expect(countProj.count).toBe(1);
  });

  it('replay rebuilds read model from full event history', async () => {
    // Simulate a stream with multiple events
    await store.append('Order-1', [
      makeStoredEvent('OrderCreated', { orderId: 'o1', total: 200 }),
    ]);
    await store.append('Order-2', [
      makeStoredEvent('OrderCreated', { orderId: 'o2', total: 300 }),
    ]);
    await store.append('Order-1', [
      makeStoredEvent('OrderShipped', { orderId: 'o1' }),
    ]);

    const projection = new OrderSummaryProjection();
    const result = await replayService.replayAll([projection]);

    expect(result.eventsProcessed).toBe(3);
    expect(projection.summaries['o1']).toEqual({ status: 'shipped', total: 200 });
    expect(projection.summaries['o2']).toEqual({ status: 'created', total: 300 });
    expect(result.errors).toHaveLength(0);
  });
});
