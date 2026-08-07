/**
 * WebSocket module interfaces.
 */

export interface WebSocketRedisOptions {
  /** Redis URL for multi-instance pub/sub */
  url: string;
}

export interface WebSocketCorsOptions {
  origin: string | string[];
}

export interface WebSocketOptions {
  /** Adapter type — 'socket.io' (default) or 'ws' */
  adapter?: 'socket.io' | 'ws';
  /** Redis config for multi-instance scaling via @socket.io/redis-adapter */
  redis?: WebSocketRedisOptions;
  /** CORS options */
  cors?: WebSocketCorsOptions;
  /** Socket.IO path (default: '/socket.io') */
  path?: string;
  /** Namespaces to auto-register */
  namespaces?: string[];
}
