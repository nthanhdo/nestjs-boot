import {
  DynamicModule,
  Global,
  MiddlewareConsumer,
  Module,
  NestModule,
  Provider,
  RequestMethod,
} from '@nestjs/common';
import type { TenancyOptions } from './interfaces';
import { TENANCY_OPTIONS } from './constants';
import { TenantContext } from './tenant-context';
import { TenantMiddleware } from './tenant.middleware';
import { TenantGuard } from './tenant.guard';
import { RowIsolation } from './strategies/row-isolation';
import { SchemaIsolation } from './strategies/schema-isolation';

export type { TenancyOptions };

/**
 * TenancyModule — opt-in multi-tenancy support for nestjs-boot.
 *
 * Strategies:
 * - 'header'    → tenant ID from request header (default: X-Tenant-ID)
 * - 'subdomain' → tenant ID from first subdomain label
 * - 'path'      → tenant ID from first path segment
 *
 * Isolation models:
 * - 'row'      → shared collections, tenantId field auto-filter (default)
 * - 'schema'   → shared DB, per-tenant collection name prefix
 * - 'database' → separate MongoDB database per tenant (see DatabaseIsolation for cost warning)
 *
 * Usage in createApp():
 * ```ts
 * const app = await createApp(AppModule, {
 *   tenancy: {
 *     strategy: 'header',
 *     isolation: 'row',
 *   },
 * });
 * ```
 *
 * This module:
 * 1. Registers TenantMiddleware on all routes ('*') to extract + store tenant ID.
 * 2. Provides TenantContext, TenantGuard, and the active isolation strategy.
 * 3. Has NO effect on applications that don't configure it — fully opt-in.
 */
@Global()
@Module({})
export class TenancyModule implements NestModule {
  static register(options: TenancyOptions): DynamicModule {
    const resolvedOptions: TenancyOptions = {
      strategy: options.strategy,
      headerName: options.headerName ?? 'X-Tenant-ID',
      resolver: options.resolver,
      isolation: options.isolation ?? 'row',
    };

    const providers: Provider[] = [
      {
        provide: TENANCY_OPTIONS,
        useValue: resolvedOptions,
      },
      TenantContext,
      TenantMiddleware,
      TenantGuard,
    ];

    // Register the isolation strategy as a provider so repositories can inject it
    if (resolvedOptions.isolation === 'row') {
      providers.push({
        provide: RowIsolation,
        useValue: new RowIsolation(),
      });
    } else if (resolvedOptions.isolation === 'schema') {
      providers.push({
        provide: SchemaIsolation,
        useValue: new SchemaIsolation(),
      });
    }
    // DatabaseIsolation is not auto-registered because it requires a uriFactory arg —
    // users instantiate it directly: new DatabaseIsolation(tenantId => `mongodb://.../${tenantId}`)

    return {
      module: TenancyModule,
      global: true,
      providers,
      exports: [TENANCY_OPTIONS, TenantContext, TenantGuard],
    };
  }

  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(TenantMiddleware).forRoutes({ path: '*', method: RequestMethod.ALL });
  }
}
