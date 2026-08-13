import { CanActivate, ExecutionContext, Injectable, Inject, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import * as jwt from 'jsonwebtoken';
import { AUTH_OPTIONS } from '../constants';
import { IS_PUBLIC_KEY } from '../constants';
import { AuthOptions } from '../interfaces';

/**
 * JwtAuthGuard — verifies Bearer token from Authorization header.
 * Attaches decoded payload to request.user.
 * Respects @Public() decorator.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(AUTH_OPTIONS) private readonly authOptions: AuthOptions,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Check @Public()
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers?.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or invalid Authorization header');
    }

    const token = authHeader.slice(7);
    try {
      const algorithm = this.authOptions.jwt!.signOptions?.algorithm ?? 'HS256';
      const decoded = jwt.verify(token, this.authOptions.jwt!.secret, {
        algorithms: [algorithm as jwt.Algorithm],
      });

      // Check token revocation if configured
      if (this.authOptions.jwt!.isRevoked) {
        const revoked = await this.authOptions.jwt!.isRevoked(decoded);
        if (revoked) {
          throw new UnauthorizedException('Token has been revoked');
        }
      }

      request.user = decoded;
      return true;
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}
