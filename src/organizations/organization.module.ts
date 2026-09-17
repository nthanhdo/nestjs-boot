import { DynamicModule, Global, Module } from '@nestjs/common';
import { ORGANIZATION_OPTIONS, ORGANIZATION_STORE } from './constants';
import type { OrganizationModuleOptions } from './interfaces';
import { MemoryOrganizationStore } from './memory-organization.store';
import { OrganizationService } from './organization.service';

/**
 * OrganizationModule — composable, store-agnostic org/dept/team hierarchy.
 *
 * Usage (in-memory, dev/test):
 * ```ts
 * OrganizationModule.register()
 * ```
 *
 * Usage (custom store, e.g. Mongoose):
 * ```ts
 * OrganizationModule.register({ store: new MongoOrganizationStore(models) })
 * ```
 */
@Global()
@Module({})
export class OrganizationModule {
  static register(options?: OrganizationModuleOptions): DynamicModule {
    const store = options?.store ?? new MemoryOrganizationStore();
    return {
      module: OrganizationModule,
      global: true,
      providers: [
        {
          provide: ORGANIZATION_OPTIONS,
          useValue: options ?? {},
        },
        {
          provide: ORGANIZATION_STORE,
          useValue: store,
        },
        OrganizationService,
      ],
      exports: [ORGANIZATION_STORE, OrganizationService],
    };
  }
}
