import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventBusModule } from '../../src/events/event-bus.module';
import { EventBusService } from '../../src/events/event-bus.service';
import { BootEvent } from '../../src/events/boot-event';
import { OnEvent } from '../../src/events/decorators';
import { EVENT_BUS_OPTIONS, EVENT_BUS_SERVICE, ON_EVENT_METADATA } from '../../src/events/constants';

class OrderCreatedEvent extends BootEvent {
  constructor(public readonly orderId: string) {
    super();
  }
}

class OrderShippedEvent extends BootEvent {
  constructor(public readonly orderId: string) {
    super();
  }
}

describe('EventBusModule', () => {
  it('register() returns a dynamic module with EventBusService', () => {
    const mod = EventBusModule.register({ transport: 'memory' });

    expect(mod.module).toBe(EventBusModule);
    expect(mod.global).toBe(true);
    expect(mod.exports).toContain(EVENT_BUS_SERVICE);
    expect(mod.exports).toContain(EventBusService);
  });
});

describe('EventBusService (memory transport)', () => {
  let service: EventBusService;

  beforeEach(() => {
    service = new EventBusService({ transport: 'memory' });
  });

  it('emit fires registered handlers', async () => {
    const handler = vi.fn();
    service.registerHandler(OrderCreatedEvent, handler);

    const event = new OrderCreatedEvent('order-1');
    await service.emit(event);

    // Give sync handlers a tick
    await new Promise((r) => setTimeout(r, 10));

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(event);
  });

  it('multiple handlers for same event all fire', async () => {
    const handler1 = vi.fn();
    const handler2 = vi.fn();
    service.registerHandler(OrderCreatedEvent, handler1);
    service.registerHandler(OrderCreatedEvent, handler2);

    const event = new OrderCreatedEvent('order-2');
    await service.emit(event);
    await new Promise((r) => setTimeout(r, 10));

    expect(handler1).toHaveBeenCalledTimes(1);
    expect(handler2).toHaveBeenCalledTimes(1);
  });

  it('emitAsync waits for all handlers to complete', async () => {
    const order: string[] = [];

    service.registerHandler(OrderCreatedEvent, async () => {
      await new Promise((r) => setTimeout(r, 50));
      order.push('handler-done');
    });

    const event = new OrderCreatedEvent('order-3');
    await service.emitAsync(event);
    order.push('after-emit');

    // handler-done should come before after-emit since emitAsync awaits
    expect(order).toEqual(['handler-done', 'after-emit']);
  });

  it('handlers for different events do not cross-fire', async () => {
    const orderHandler = vi.fn();
    const shipHandler = vi.fn();
    service.registerHandler(OrderCreatedEvent, orderHandler);
    service.registerHandler(OrderShippedEvent, shipHandler);

    await service.emit(new OrderCreatedEvent('order-4'));
    await new Promise((r) => setTimeout(r, 10));

    expect(orderHandler).toHaveBeenCalledTimes(1);
    expect(shipHandler).not.toHaveBeenCalled();
  });

  it('onModuleDestroy completes without error', async () => {
    await expect(service.onModuleDestroy()).resolves.not.toThrow();
  });
});

describe('BootEvent', () => {
  it('has timestamp set automatically', () => {
    const event = new OrderCreatedEvent('order-5');
    expect(event.timestamp).toBeInstanceOf(Date);
  });

  it('correlationId is undefined when correlation module not in context', () => {
    const event = new OrderCreatedEvent('order-6');
    // correlationId may be undefined if no AsyncLocalStorage context
    expect(event.correlationId).toBeUndefined();
  });
});

describe('@OnEvent decorator', () => {
  it('sets metadata with event class', () => {
    class Handler {
      @OnEvent(OrderCreatedEvent)
      handle() {}
    }

    const metadata = Reflect.getMetadata(ON_EVENT_METADATA, Handler.prototype.handle);
    expect(metadata).toEqual({ eventClass: OrderCreatedEvent, options: {} });
  });

  it('sets metadata with async option', () => {
    class Handler {
      @OnEvent(OrderCreatedEvent, { async: true })
      handle() {}
    }

    const metadata = Reflect.getMetadata(ON_EVENT_METADATA, Handler.prototype.handle);
    expect(metadata).toEqual({ eventClass: OrderCreatedEvent, options: { async: true } });
  });
});
