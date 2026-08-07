export interface EventBusOptions {
  transport: 'memory' | 'redis';
  redis?: { url: string };
  /**
   * Optional pre-created Redis client for the event bus.
   * When provided, the EventBus reuses this client instead of creating its own ioredis connection.
   * This allows sharing a Redis client from CacheModule or another source.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  redisClient?: { publisher: any; subscriber: any };
}

export interface OnEventOptions {
  async?: boolean;
}

export interface EmitAndWaitOptions {
  /** Timeout in milliseconds. Default: 5000 */
  timeout?: number;
}
