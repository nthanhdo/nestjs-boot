import { Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
} from '@nestjs/websockets';
import { randomUUID } from 'crypto';
import { WsCorrelationInterceptor } from './ws-correlation.interceptor';
import {
  WS_AUTH_REQUIRED_KEY,
  WS_ROOM_KEY,
} from './decorators';

/**
 * Minimal socket interface — avoids hard dependency on socket.io types.
 */
interface BootSocket {
  id: string;
  nsp?: { name?: string };
  handshake?: {
    auth?: Record<string, unknown>;
    query?: Record<string, string>;
  };
  data?: Record<string, unknown>;
  join?(room: string): void;
  disconnect?(force?: boolean): void;
}

/**
 * Abstract base gateway with common production patterns.
 *
 * - Auto-logs connect/disconnect with correlationId
 * - Auto-joins rooms based on @WsRoom metadata
 * - Auto-validates auth on @WsAuthRequired methods
 * - Assigns correlationId per message
 *
 * @example
 * ```ts
 * @WebSocketGateway({ namespace: '/chat' })
 * export class ChatGateway extends BootWsGateway {
 *   @SubscribeMessage('message')
 *   @WsRoom('lobby')
 *   handleMessage(@MessageBody() data: any) {
 *     return data;
 *   }
 * }
 * ```
 */
export abstract class BootWsGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  protected readonly logger = new Logger(this.constructor.name);
  protected reflector = new Reflector();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  afterInit(server: any): void {
    this.logger.log(`Gateway initialized: ${this.constructor.name}`);
    this.onInit(server);
  }

  handleConnection(client: BootSocket): void {
    const namespace = client.nsp?.name ?? '/';
    const correlationId = randomUUID();
    if (client.data) {
      client.data['correlationId'] = correlationId;
    }

    WsCorrelationInterceptor.trackConnection(namespace);
    this.logger.log(
      `[WS] connect id=${client.id} ns=${namespace} correlationId=${correlationId}`,
    );

    // Auto-join room from class-level @WsRoom metadata
    const room = this.reflector.get<string>(WS_ROOM_KEY, this.constructor);
    if (room && client.join) {
      client.join(room);
      this.logger.debug(`Auto-joined room: ${room}`);
    }

    // Auth validation
    const requiresAuth = this.reflector.get<boolean>(
      WS_AUTH_REQUIRED_KEY,
      this.constructor,
    );
    if (requiresAuth) {
      const token =
        client.handshake?.auth?.['token'] ??
        client.handshake?.query?.['token'];
      if (!token) {
        this.logger.warn(`[WS] unauthenticated connection rejected id=${client.id}`);
        client.disconnect?.(true);
        return;
      }
    }

    this.onConnect(client);
  }

  handleDisconnect(client: BootSocket): void {
    const namespace = client.nsp?.name ?? '/';
    WsCorrelationInterceptor.untrackConnection(namespace);
    this.logger.log(`[WS] disconnect id=${client.id} ns=${namespace}`);
    this.onDisconnect(client);
  }

  // Lifecycle hooks — override in subclass as needed
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected onInit(_server: any): void {}
  protected onConnect(_client: BootSocket): void {}
  protected onDisconnect(_client: BootSocket): void {}
}
