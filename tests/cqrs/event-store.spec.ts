import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryEventStore } from '../../src/cqrs/adapters/memory-event-store';
import { ConcurrencyError } from '../../src/cqrs/interfaces';
import { StoredEvent } from '../../src/cqrs/domain-event';

function makeEvent(type: string, data: Record<string, unknown> = {}): StoredEvent {
  return {
    streamId: '', // will be set by store
    version: 0,   // will be set by store
    type,
    data,
    metadata: { timestamp: new Date() },
    position: 0,  // will be set by store
  };
}

describe('EventStore (MemoryEventStore)', () => {
  let store: MemoryEventStore;

  beforeEach(() => {
    store = new MemoryEventStore();
  });

  it('appends and reads events for a stream', async () => {
    await store.append('Order-1', [
      makeEvent('OrderCreated', { total: 100 }),
      makeEvent('OrderConfirmed'),
    ]);

    const events = await store.getEvents('Order-1');
    expect(events).toHaveLength(2);
    expect(events[0].type).toBe('OrderCreated');
    expect(events[0].data.total).toBe(100);
    expect(events[1].type).toBe('OrderConfirmed');
  });

  it('assigns versions in correct order', async () => {
    await store.append('Order-1', [makeEvent('A'), makeEvent('B')]);
    await store.append('Order-1', [makeEvent('C')]);

    const events = await store.getEvents('Order-1');
    expect(events.map((e) => e.version)).toEqual([1, 2, 3]);
  });

  it('throws ConcurrencyError on version mismatch', async () => {
    await store.append('Order-1', [makeEvent('A')]);

    // Stream is at version 1, but we expect 0
    await expect(
      store.append('Order-1', [makeEvent('B')], 0),
    ).rejects.toThrow(ConcurrencyError);
  });

  it('getAllEvents returns events in global position order', async () => {
    await store.append('Order-1', [makeEvent('A')]);
    await store.append('Order-2', [makeEvent('X')]);
    await store.append('Order-1', [makeEvent('B')]);

    const all = await store.getAllEvents();
    expect(all).toHaveLength(3);
    expect(all.map((e) => e.type)).toEqual(['A', 'X', 'B']);
    // positions are monotonically increasing
    expect(all[0].position).toBeLessThan(all[1].position);
    expect(all[1].position).toBeLessThan(all[2].position);
  });

  it('returns empty array for non-existent stream', async () => {
    const events = await store.getEvents('does-not-exist');
    expect(events).toEqual([]);
  });

  it('getEvents with fromVersion returns only events after that version', async () => {
    await store.append('Order-1', [makeEvent('A'), makeEvent('B'), makeEvent('C')]);

    const events = await store.getEvents('Order-1', 1);
    expect(events).toHaveLength(2);
    expect(events[0].type).toBe('B');
    expect(events[0].version).toBe(2);
  });
});
