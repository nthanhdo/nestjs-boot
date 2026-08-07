import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Controller, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { createMessageDispatcher } from '../../src/testing';

// Simulate @MessagePattern and @EventPattern decorators via Reflect metadata
// (avoids requiring @nestjs/microservices as a dependency)
function MessagePattern(pattern: string) {
  return (target: any, key: string, _descriptor: PropertyDescriptor) => {
    Reflect.defineMetadata('microservices:pattern', [pattern], target[key]);
    Reflect.defineMetadata('microservices:handler_type', 0, target[key]); // 0 = message
  };
}

function EventPattern(pattern: string) {
  return (target: any, key: string, _descriptor: PropertyDescriptor) => {
    Reflect.defineMetadata('microservices:pattern', [pattern], target[key]);
    Reflect.defineMetadata('microservices:handler_type', 1, target[key]); // 1 = event
  };
}

@Controller()
class OrderController {
  private lastEvent: any = null;

  @MessagePattern('order.find')
  findOrder(data: { id: string }) {
    return { id: data.id, status: 'found' };
  }

  @EventPattern('order.created')
  onOrderCreated(data: { orderId: string }) {
    this.lastEvent = data;
  }

  getLastEvent() {
    return this.lastEvent;
  }
}

@Module({
  controllers: [OrderController],
})
class OrderModule {}

describe('createMessageDispatcher', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [OrderModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('send invokes @MessagePattern handler and returns response', async () => {
    const dispatcher = createMessageDispatcher(app);
    const result = await dispatcher.send('order.find', { id: '42' });
    expect(result).toEqual({ id: '42', status: 'found' });
  });

  it('emit invokes @EventPattern handler', async () => {
    const dispatcher = createMessageDispatcher(app);
    await dispatcher.emit('order.created', { orderId: '99' });

    const controller = app.get(OrderController);
    expect(controller.getLastEvent()).toEqual({ orderId: '99' });
  });

  it('throws on unknown pattern', async () => {
    const dispatcher = createMessageDispatcher(app);
    await expect(dispatcher.send('unknown.pattern', {})).rejects.toThrow(
      'No handler found for pattern "unknown.pattern"',
    );
  });
});
