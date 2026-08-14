import { Logger } from '@nestjs/common';
import { WebSocketOptions } from './interfaces';

const logger = new Logger('RedisAdapterFactory');

/**
 * Creates a @socket.io/redis-adapter when redis is configured.
 * Enables pub/sub across multiple NestJS instances.
 * Falls back to default in-memory adapter if redis is not configured
 * or if @socket.io/redis-adapter is not installed.
 *
 * @returns adapter creator function or null (fallback to default)
 */
export function createRedisAdapterFactory(
  options: WebSocketOptions,
): ((io: unknown) => void) | null {
  if (!options.redis?.url) {
    return null;
  }

  try {
     
    const { createAdapter } = require('@socket.io/redis-adapter');
     
    const Redis = require('ioredis');

    const pubClient = new Redis(options.redis.url);
    const subClient = pubClient.duplicate();

    pubClient.on('error', (err: Error) => {
      logger.error(`Redis pub client error: ${err.message}`);
    });
    subClient.on('error', (err: Error) => {
      logger.error(`Redis sub client error: ${err.message}`);
    });

    pubClient.on('connect', () => logger.log('Redis pub client connected'));
    subClient.on('connect', () => logger.log('Redis sub client connected'));

    const adapter = createAdapter(pubClient, subClient);
    logger.log('Redis adapter created — WebSocket pub/sub enabled across instances');

    return adapter;
  } catch (err) {
    logger.warn(
      `@socket.io/redis-adapter or ioredis not installed — falling back to in-memory adapter (single instance only). ` +
        `Install @socket.io/redis-adapter + ioredis for multi-instance support. ` +
        `Error: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}
