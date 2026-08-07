import { CanActivate, ExecutionContext, Injectable, Inject } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AUTH_OPTIONS, IS_PUBLIC_KEY } from '../constants';
import { AuthOptions } from '../interfaces';
import { BootJwtService } from '../services/jwt.service';

/**
 * WsJwtGuard — authenticates WebSocket connections via JWT.
 *
 * Reads token from:
 *  1. `client.handshake.headers.authorization` (Bearer <token>)
 *  2. `client.handshake.auth.token` (Socket.IO auth object)
 *
 * Attaches decoded payload to `client.data.user`.
 * Respects @Public() decorator.
 */
@Injectable()
export class WsJwtGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(AUTH_OPTIONS) private readonly authOptions: AuthOptions,
    private readonly jwtService: BootJwtService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Check @Public()
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const client = context.switchToWs().getClient();
    const token = this.extractToken(client);

    if (!token) {
      throw new Error('Missing authentication token in WebSocket handshake');
    }

    try {
      const decoded = this.jwtService.verify(token);

      // Check token revocation if configured
      if (this.authOptions.jwt?.isRevoked) {
        const revoked = await this.authOptions.jwt.isRevoked(decoded);
        if (revoked) {
          throw new Error('Token has been revoked');
        }
      }

      // Attach to client.data for downstream access
      if (!client.data) client.data = {};
      client.data.user = decoded;

      return true;
    } catch {
      throw new Error('Invalid or expired WebSocket authentication token');
    }
  }

  private extractToken(client: any): string | null {
    // Socket.IO style: handshake.headers.authorization
    const authHeader = client.handshake?.headers?.authorization;
    if (authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
      return authHeader.slice(7);
    }

    // Socket.IO auth object: handshake.auth.token
    const authToken = client.handshake?.auth?.token;
    if (authToken && typeof authToken === 'string') {
      return authToken;
    }

    // Raw ws: headers on upgrade request
    const upgradeHeaders = client.upgradeReq?.headers?.authorization;
    if (upgradeHeaders && typeof upgradeHeaders === 'string' && upgradeHeaders.startsWith('Bearer ')) {
      return upgradeHeaders.slice(7);
    }

    return null;
  }
}
