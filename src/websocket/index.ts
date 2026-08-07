export { WebSocketModule, WS_OPTIONS, WS_REDIS_ADAPTER } from './websocket.module';
export { WsCorrelationInterceptor } from './ws-correlation.interceptor';
export { BootWsGateway } from './ws-gateway.base';
export { createRedisAdapterFactory } from './redis-adapter.factory';
export {
  WsRoom,
  WsBroadcast,
  WsAuthRequired,
  OnConnection,
  OnDisconnection,
  WS_ROOM_KEY,
  WS_BROADCAST_KEY,
  WS_AUTH_REQUIRED_KEY,
} from './decorators';
export type { WebSocketOptions, WebSocketRedisOptions, WebSocketCorsOptions } from './interfaces';
