import {
  CallHandler,
  ExecutionContext,
  Inject,
  Injectable,
  Logger,
  NestInterceptor,
  Optional,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { DEPRECATED_VERSION_KEY } from './constants';
import { VERSIONING_OPTIONS } from './constants';
import type { VersioningOptions } from './interfaces';

/**
 * VersionInterceptor — adds API version metadata to every HTTP response.
 *
 * Behaviour:
 * - Sets `X-API-Version` response header to the resolved API version.
 * - If the handler/controller is decorated with @DeprecatedVersion(sunset),
 *   also adds `Sunset: <date>` and `Deprecation: true` headers, and logs
 *   a deprecation warning.
 *
 * Registered globally by VersioningModule.
 */
@Injectable()
export class VersionInterceptor implements NestInterceptor {
  private readonly logger = new Logger('VersionInterceptor');

  constructor(
    private readonly reflector: Reflector,
    @Optional() @Inject(VERSIONING_OPTIONS) private readonly options: VersioningOptions,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const response = http.getResponse<Record<string, any>>();

    // Resolve current version from the request (best-effort)
    const request = http.getRequest<Record<string, any>>();
    const resolvedVersion = this.resolveVersion(request);

    if (resolvedVersion && typeof response.set === 'function') {
      response.set('X-API-Version', resolvedVersion);
    }

    // Check if this handler/controller is deprecated
    const sunsetDate = this.reflector.getAllAndOverride<string | undefined>(
      DEPRECATED_VERSION_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (sunsetDate && typeof response.set === 'function') {
      response.set('Sunset', sunsetDate);
      response.set('Deprecation', 'true');

      const handler = `${context.getClass().name}.${context.getHandler().name}`;
      this.logger.warn(
        `Deprecated API endpoint called: ${handler} — sunset on ${sunsetDate}`,
      );
    }

    return next.handle().pipe(
      tap(() => {
        // Headers already set above (Express sets them before body flush)
      }),
    );
  }

  private resolveVersion(request: Record<string, any>): string | undefined {
    const type = this.options?.type ?? 'uri';
    const defaultVersion = this.options?.defaultVersion ?? '1';

    if (type === 'header') {
      const headerName = (this.options?.header ?? 'X-API-Version').toLowerCase();
      return (request.headers?.[headerName] as string) ?? defaultVersion;
    }

    if (type === 'uri') {
      // Extract version from path prefix /v{N}/...
      const path: string = request.path ?? request.url ?? '';
      const match = path.match(/^\/v(\d+)/);
      return match ? match[1] : defaultVersion;
    }

    if (type === 'media-type') {
      const accept: string = request.headers?.accept ?? '';
      const key = this.options?.mediaTypeKey ?? 'version';
      const match = accept.match(new RegExp(`${key}=([\\w.]+)`));
      return match ? match[1] : defaultVersion;
    }

    return defaultVersion;
  }
}
