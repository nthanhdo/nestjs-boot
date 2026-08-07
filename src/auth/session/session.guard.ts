import { CanActivate, ExecutionContext, Injectable, Inject, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../constants';
import { SESSION_OPTIONS } from './session.constants';
import { SessionModuleOptions } from './session.interfaces';

/**
 * SessionGuard — validates that a valid session exists.
 * Reads session ID from cookie, fetches from store, attaches to request.
 * Respects @Public() decorator.
 */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(SESSION_OPTIONS) private readonly options: SessionModuleOptions,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const cookieName = this.options.cookieName ?? 'boot.sid';

    // Parse session ID from cookie
    const sessionId = this.getCookie(request, cookieName);
    if (!sessionId) {
      throw new UnauthorizedException('No session cookie found');
    }

    // Verify cookie signature
    const unsignedId = this.unsignCookie(sessionId, this.options.secret);
    if (!unsignedId) {
      throw new UnauthorizedException('Invalid session cookie signature');
    }

    // Fetch session from store
    const store = this.options.store;
    if (!store) {
      throw new UnauthorizedException('No session store configured');
    }

    const sessionData = await store.get(unsignedId);
    if (!sessionData) {
      throw new UnauthorizedException('Session not found or expired');
    }

    // Touch to extend TTL
    await store.touch(unsignedId, this.options.maxAge);

    // Attach session to request
    request.session = sessionData;
    request.sessionId = unsignedId;

    return true;
  }

  private getCookie(request: any, name: string): string | undefined {
    // Express parsed cookies
    if (request.cookies) {
      return request.cookies[name];
    }
    // Manual parse from header
    const cookieHeader = request.headers?.cookie;
    if (!cookieHeader) return undefined;
    const match = cookieHeader.split(';').find((c: string) => c.trim().startsWith(`${name}=`));
    return match ? match.split('=').slice(1).join('=').trim() : undefined;
  }

  private unsignCookie(signedValue: string, secret: string): string | null {
    // Format: value.signature
    const dotIndex = signedValue.lastIndexOf('.');
    if (dotIndex === -1) return signedValue; // unsigned cookie, accept as-is

    const value = signedValue.slice(0, dotIndex);
    const signature = signedValue.slice(dotIndex + 1);

    const crypto = require('crypto');
    const expected = crypto
      .createHmac('sha256', secret)
      .update(value)
      .digest('base64url');

    if (signature === expected) return value;
    return null;
  }
}
