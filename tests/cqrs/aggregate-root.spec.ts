import { describe, it, expect } from 'vitest';
import { AggregateRoot } from '../../src/cqrs/aggregate-root';
import { DomainEvent, StoredEvent } from '../../src/cqrs/domain-event';

class ItemAddedEvent extends DomainEvent {
  readonly type = 'ItemAdded';
  constructor(public readonly itemId: string, public readonly qty: number) {
    super();
  }
}

class ItemRemovedEvent extends DomainEvent {
  readonly type = 'ItemRemoved';
  constructor(public readonly itemId: string) {
    super();
  }
}

class Cart extends AggregateRoot {
  public items: { id: string; qty: number }[] = [];

  addItem(id: string, qty: number): void {
    this.apply(new ItemAddedEvent(id, qty));
  }

  removeItem(id: string): void {
    this.apply(new ItemRemovedEvent(id));
  }

  applyEvent(event: DomainEvent): void {
    if (event instanceof ItemAddedEvent || (event as StoredEvent).type === 'ItemAdded') {
      const data = event instanceof ItemAddedEvent ? event : (event as unknown as { data: { itemId: string; qty: number } }).data;
      const itemId = event instanceof ItemAddedEvent ? event.itemId : (data as { itemId: string }).itemId;
      const qty = event instanceof ItemAddedEvent ? event.qty : (data as { qty: number }).qty;
      this.items.push({ id: itemId, qty });
    } else if (event instanceof ItemRemovedEvent || (event as StoredEvent).type === 'ItemRemoved') {
      const itemId = event instanceof ItemRemovedEvent ? event.itemId : ((event as unknown as { data: { itemId: string } }).data.itemId);
      this.items = this.items.filter((i) => i.id !== itemId);
    }
  }
}

describe('AggregateRoot', () => {
  it('apply() adds events to uncommitted list', () => {
    const cart = new Cart();
    cart.addItem('sku-1', 2);
    cart.addItem('sku-2', 1);

    const uncommitted = cart.getUncommittedEvents();
    expect(uncommitted).toHaveLength(2);
    expect(uncommitted[0]).toBeInstanceOf(ItemAddedEvent);
    expect((uncommitted[0] as ItemAddedEvent).itemId).toBe('sku-1');
  });

  it('loadFromHistory() rebuilds state from stored events', () => {
    const cart = new Cart();
    const history: StoredEvent[] = [
      { streamId: 'cart-1', version: 1, type: 'ItemAdded', data: { itemId: 'sku-1', qty: 3 }, metadata: { timestamp: new Date() }, position: 1 },
      { streamId: 'cart-1', version: 2, type: 'ItemAdded', data: { itemId: 'sku-2', qty: 1 }, metadata: { timestamp: new Date() }, position: 2 },
      { streamId: 'cart-1', version: 3, type: 'ItemRemoved', data: { itemId: 'sku-1' }, metadata: { timestamp: new Date() }, position: 3 },
    ];

    cart.loadFromHistory(history);

    expect(cart.items).toHaveLength(1);
    expect(cart.items[0].id).toBe('sku-2');
    expect(cart.getVersion()).toBe(3);
    // No uncommitted events — these are historical
    expect(cart.getUncommittedEvents()).toHaveLength(0);
  });

  it('clearUncommittedEvents() empties the list', () => {
    const cart = new Cart();
    cart.addItem('sku-1', 1);
    expect(cart.getUncommittedEvents()).toHaveLength(1);

    cart.clearUncommittedEvents();
    expect(cart.getUncommittedEvents()).toHaveLength(0);
  });

  it('version increments with each applied event', () => {
    const cart = new Cart();
    expect(cart.getVersion()).toBe(0);

    cart.addItem('a', 1);
    expect(cart.getVersion()).toBe(1);

    cart.addItem('b', 2);
    expect(cart.getVersion()).toBe(2);

    cart.removeItem('a');
    expect(cart.getVersion()).toBe(3);
  });
});
