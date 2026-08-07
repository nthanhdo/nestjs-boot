import { SetMetadata, applyDecorators } from '@nestjs/common';

export const WS_ROOM_KEY = 'ws:room';
export const WS_BROADCAST_KEY = 'ws:broadcast';
export const WS_AUTH_REQUIRED_KEY = 'ws:auth-required';
export const WS_ON_CONNECTION_KEY = 'ws:on-connection';
export const WS_ON_DISCONNECTION_KEY = 'ws:on-disconnection';

/**
 * Declares the room this handler belongs to.
 * The gateway uses this to auto-join clients on connect.
 *
 * @example
 * ```ts
 * @WsRoom('chat:lobby')
 * handleMessage(@MessageBody() data: any) { ... }
 * ```
 */
export const WsRoom = (room: string) => SetMetadata(WS_ROOM_KEY, room);

/**
 * Marks a handler to broadcast its return value to all clients in the room.
 * Requires @WsRoom on the same method (or class) to determine the target room.
 *
 * @example
 * ```ts
 * @WsBroadcast()
 * @WsRoom('chat:lobby')
 * handleMessage(@MessageBody() data: any) { return data; }
 * ```
 */
export const WsBroadcast = () => SetMetadata(WS_BROADCAST_KEY, true);

/**
 * Requires an authenticated WebSocket connection (JWT in handshake auth or query).
 * Unauthenticated connections will be rejected with `WsException('Unauthorized')`.
 *
 * @example
 * ```ts
 * @WsAuthRequired()
 * handleSecretMessage(@MessageBody() data: any) { ... }
 * ```
 */
export const WsAuthRequired = () => SetMetadata(WS_AUTH_REQUIRED_KEY, true);

/**
 * Lifecycle hook — method is called when a client connects to this gateway.
 * The method receives the connected socket as its argument.
 *
 * @example
 * ```ts
 * @OnConnection()
 * onConnect(client: Socket) {
 *   console.log('Client connected:', client.id);
 * }
 * ```
 */
export const OnConnection = () =>
  applyDecorators(SetMetadata(WS_ON_CONNECTION_KEY, true));

/**
 * Lifecycle hook — method is called when a client disconnects from this gateway.
 * The method receives the disconnected socket as its argument.
 *
 * @example
 * ```ts
 * @OnDisconnection()
 * onDisconnect(client: Socket) {
 *   console.log('Client disconnected:', client.id);
 * }
 * ```
 */
export const OnDisconnection = () =>
  applyDecorators(SetMetadata(WS_ON_DISCONNECTION_KEY, true));
