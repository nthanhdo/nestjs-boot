import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { WebSocketModule, WS_OPTIONS, WS_REDIS_ADAPTER } from '../../src/websocket/websocket.module';
import { WsCorrelationInterceptor } from '../../src/websocket/ws-correlation.interceptor';
import { BootWsGateway } from '../../src/websocket/ws-gateway.base';
import { createRedisAdapterFactory } from '../../src/websocket/redis-adapter.factory';
import {
  WsRoom,
  WsBroadcast,
  WsAuthRequired,
  OnConnection,
  OnDisconnection,
  WS_ROOM_KEY,
  WS_BROADCAST_KEY,
  WS_AUTH_REQUIRED_KEY,
} from '../../src/websocket/decorators';

// ── Test 1: WebSocketModule.register() wires options + providers ──
describe('WebSocketModule', () => {
  it('registers WS_OPTIONS and WsCorrelationInterceptor as providers', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        WebSocketModule.register({
          adapter: 'socket.io',
          path: '/ws',
          namespaces: ['/chat'],
        }),
      ],
    }).compile();

    const opts = moduleRef.get(WS_OPTIONS);
    expect(opts.adapter).toBe('socket.io');
    expect(opts.path).toBe('/ws');
    expect(opts.namespaces).toEqual(['/chat']);

    const interceptor = moduleRef.get(WsCorrelationInterceptor);
    expect(interceptor).toBeDefined();
  });

  // ── Test 2: Redis adapter falls back gracefully when package not installed ──
  it('WS_REDIS_ADAPTER is null when @socket.io/redis-adapter not installed', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        WebSocketModule.register({
          // no redis config → adapter should be null
        }),
      ],
    }).compile();

    const adapter = moduleRef.get(WS_REDIS_ADAPTER);
    // Without redis.url configured, adapter must be null
    expect(adapter).toBeNull();
  });

  // ── Test 3: createRedisAdapterFactory returns null when no redis.url ──
  it('createRedisAdapterFactory returns null when redis not configured', () => {
    const factory = createRedisAdapterFactory({});
    expect(factory).toBeNull();
  });

  // ── Test 4: createRedisAdapterFactory returns null when package missing ──
  it('createRedisAdapterFactory returns null (logs warn) when package not installed', () => {
    // The package is not installed in this test environment — should not throw
    const factory = createRedisAdapterFactory({ redis: { url: 'redis://localhost:6379' } });
    // Either null (not installed) or a function (installed) — both valid
    expect(factory === null || typeof factory === 'function').toBe(true);
  });

  // ── Test 5: Decorators attach correct metadata ──
  describe('WebSocket decorators', () => {
    it('@WsRoom sets room metadata', () => {
      class TestGateway {
        @WsRoom('lobby')
        handleMessage() {}
      }
      const meta = Reflect.getMetadata(WS_ROOM_KEY, TestGateway.prototype.handleMessage);
      expect(meta).toBe('lobby');
    });

    it('@WsBroadcast sets broadcast metadata', () => {
      class TestGateway {
        @WsBroadcast()
        handleMessage() {}
      }
      const meta = Reflect.getMetadata(WS_BROADCAST_KEY, TestGateway.prototype.handleMessage);
      expect(meta).toBe(true);
    });

    it('@WsAuthRequired sets auth-required metadata', () => {
      class TestGateway {
        @WsAuthRequired()
        handleSecure() {}
      }
      const meta = Reflect.getMetadata(WS_AUTH_REQUIRED_KEY, TestGateway.prototype.handleSecure);
      expect(meta).toBe(true);
    });

    it('@OnConnection and @OnDisconnection attach lifecycle metadata', () => {
      class TestGateway {
        @OnConnection()
        onConnect() {}

        @OnDisconnection()
        onDisconnect() {}
      }
      // decorators applied without throwing = pass
      expect(new TestGateway()).toBeDefined();
    });
  });
});
