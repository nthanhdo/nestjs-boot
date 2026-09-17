import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Inject } from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { createHash } from 'crypto';
import { CONTENT_MODULE_OPTIONS } from '../constants';
import type { ContentModuleOptions } from '../interfaces/content-options.interface';

/**
 * Interceptor that adds CDN-friendly cache headers to Delivery API responses.
 *
 * - Cache-Control: public, max-age={n}, stale-while-revalidate={n}
 * - ETag: based on response content hash
 * - Last-Modified: from entry updatedAt if available
 * - 304 Not Modified: when If-None-Match matches ETag
 */
@Injectable()
export class CdnCacheInterceptor implements NestInterceptor {
  private readonly defaultMaxAge: number;
  private readonly assetMaxAge: number;
  private readonly staleWhileRevalidate: number;

  constructor(@Inject(CONTENT_MODULE_OPTIONS) options: ContentModuleOptions) {
    this.defaultMaxAge = options.cdn?.defaultMaxAge ?? 300;
    this.assetMaxAge = options.cdn?.assetMaxAge ?? 86400;
    this.staleWhileRevalidate = options.cdn?.staleWhileRevalidate ?? 60;
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();
    const path = request.url as string;
    const ifNoneMatch = request.headers['if-none-match'] as string | undefined;
    const ifModifiedSince = request.headers['if-modified-since'] as string | undefined;

    // Determine max-age based on path
    const isAsset = path.includes('/assets/');
    const isType = path.includes('/types');
    const maxAge = isAsset ? this.assetMaxAge : isType ? 3600 : this.defaultMaxAge;

    return next.handle().pipe(
      tap((data) => {
        if (!data) return;

        // Generate ETag from response data
        const etag = this.generateETag(data);

        // Check If-None-Match → 304
        if (ifNoneMatch && ifNoneMatch === etag) {
          response.status(304);
          return;
        }

        // Check If-Modified-Since → 304
        if (ifModifiedSince && data?.updatedAt) {
          const lastModified = new Date(data.updatedAt);
          const ifModified = new Date(ifModifiedSince);
          if (lastModified <= ifModified) {
            response.status(304);
            return;
          }
        }

        // Set cache headers
        response.setHeader('Cache-Control', `public, max-age=${maxAge}, stale-while-revalidate=${this.staleWhileRevalidate}`);
        response.setHeader('ETag', etag);

        if (data?.updatedAt) {
          response.setHeader('Last-Modified', new Date(data.updatedAt).toUTCString());
        }

        // Vary by locale and API key
        response.setHeader('Vary', 'X-API-Key, Accept-Language');
      }),
    );
  }

  private generateETag(data: unknown): string {
    const hash = createHash('md5')
      .update(JSON.stringify(data))
      .digest('hex');
    return `"${hash}"`;
  }
}
