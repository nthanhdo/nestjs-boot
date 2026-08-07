import { DynamicModule, Logger, Module } from '@nestjs/common';
import { WebSocketOptions } from './interfaces';
import { WsCorrelationInterceptor } from './ws-correlation.interceptor';
import { createRedisAdapterFactory } from './redis-adapter.factory';

export const WS_OPTIONS = 'WS_OPTIONS';
export const WS_REDIS_ADAPTER = 'WS_REDIS_ADAPTER';

/**
 * WebSocketModule — production-ready WebSocket scaling for NestJS.
 *
 * Features:
 * - Socket.IO or native 'ws' adapter (default: socket.io)
 * - Redis adapter for multi-instance pub/sub (opt-in via redis.url)
 * - CORS + path configuration
 * - Auto-register namespaces
 * - WsCorrelationInterceptor for correlationId + metrics
 *
 * @example
 * ```ts
 * WebSocketModule.register({
 *   adapter: 'socket.io',
 *   redis: { url: 'redis://localhost:6379' },
 *   cors: { origin: 'https://app.example.com' },
 *   path: '/socket.io',
 *   namespaces: ['/chat', '/notifications'],
 * })
 * ```
 *
 * Optional dependencies:
 * - @socket.io/redis-adapter + ioredis (multi-instance Redis pub/sub)
 * - socket.io (for socket.io adapter — usually bundled with @nestjs/platform-socket.io)
 */
@Module({})
export class WebSocketModule {
  private static readonly logger = new Logger('WebSocketModule');

  static register(options: WebSocketOptions = {}): DynamicModule {
    const resolvedOptions: Required<Pick<WebSocketOptions, 'adapter' | 'path'>> &
      WebSocketOptions = {
      adapter: options.adapter ?? 'socket.io',
      path: options.path ?? '/socket.io',
      ...options,
    };

    const redisAdapterFactory = createRedisAdapterFactory(resolvedOptions);

    if (resolvedOptions.redis?.url) {
      if (redisAdapterFactory) {
        WebSocketModule.logger.log(
          `WebSocket: Redis adapter enabled (url: ${resolvedOptions.redis.url.replace(/:\/\/[^@]*@/, '://*@')})`,
        );
      } else {
        WebSocketModule.logger.warn(
          'WebSocket: redis.url configured but @socket.io/redis-adapter not installed — single instance only',
        );
      }
    }

    if (resolvedOptions.namespaces?.length) {
      WebSocketModule.logger.log(
        `WebSocket: namespaces auto-registered: ${resolvedOptions.namespaces.join(', ')}`,
      );
    }

    return {
      module: WebSocketModule,
      providers: [
        {
          provide: WS_OPTIONS,
          useValue: resolvedOptions,
        },
        {
          provide: WS_REDIS_ADAPTER,
          useValue: redisAdapterFactory,
        },
        WsCorrelationInterceptor,
      ],
      exports: [WS_OPTIONS, WS_REDIS_ADAPTER, WsCorrelationInterceptor],
      global: true,
    };
  }
}
