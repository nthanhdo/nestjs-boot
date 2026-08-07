import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Module, Injectable } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { createGrpcTestClient } from '../../src/testing';

@Injectable()
class OrderService {
  findOne(data: { id: string }) {
    return { id: data.id, status: 'shipped', total: 99.99 };
  }

  findAll() {
    return { orders: [{ id: '1' }, { id: '2' }] };
  }
}

@Module({
  providers: [OrderService],
  exports: [OrderService],
})
class OrderModule {}

describe('createGrpcTestClient', () => {
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

  it('calls a handler method and returns the response', async () => {
    const client = createGrpcTestClient(app, 'OrderService', OrderService);
    const result = await client.call('findOne', { id: '123' });
    expect(result).toEqual({ id: '123', status: 'shipped', total: 99.99 });
  });

  it('throws on unknown method name', async () => {
    const client = createGrpcTestClient(app, 'OrderService', OrderService);
    await expect(client.call('nonExistent', {})).rejects.toThrow('Method "nonExistent" not found');
  });

  it('lists available methods', () => {
    const client = createGrpcTestClient(app, 'OrderService', OrderService);
    const methods = client.listMethods();
    expect(methods).toContain('findOne');
    expect(methods).toContain('findAll');
  });
});
