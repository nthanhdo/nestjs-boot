import { CanActivate, ExecutionContext, Injectable, Inject, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AUTH_OPTIONS, IS_PUBLIC_KEY } from '../constants';
import { AuthOptions } from '../interfaces';

/**
 * ApiKeyGuard — validates API key from configured header.
 * Calls user-provided validate() function.
 * If validate returns { valid: true, permissions: [...] }, attaches permissions to request.
 * Respects @Public() decorator.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(AUTH_OPTIONS) private readonly authOptions: AuthOptions,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const headerName = this.authOptions.apiKey?.headerName ?? 'x-api-key';
    const apiKey = request.headers?.[headerName];

    if (!apiKey) {
      throw new UnauthorizedException(`Missing ${headerName} header`);
    }

    const result = await this.authOptions.apiKey!.validate(apiKey);

    if (typeof result === 'boolean') {
      if (!result) throw new UnauthorizedException('Invalid API key');
      return true;
    }

    if (!result.valid) {
      throw new UnauthorizedException('Invalid API key');
    }

    // Attach permissions from API key validation
    if (result.permissions) {
      if (!request.user) request.user = {};
      request.user.permissions = result.permissions;
    }

    return true;
  }
}
