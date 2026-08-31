import { DynamicModule, Global, Module, OnModuleInit, Inject, Optional } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { POLICY_OPTIONS } from './constants';
import { PolicyModuleOptions } from './interfaces';
import { PolicyRegistry } from './policy.registry';
import { PolicyEngine } from './policy.engine';
import { PolicyGuard } from './policy.guard';

@Global()
@Module({})
export class PolicyModule implements OnModuleInit {
  constructor(
    private readonly registry: PolicyRegistry,
    @Optional() @Inject(POLICY_OPTIONS) private readonly options?: PolicyModuleOptions,
  ) {}

  static register(options?: PolicyModuleOptions): DynamicModule {
    return {
      module: PolicyModule,
      global: true,
      providers: [
        {
          provide: POLICY_OPTIONS,
          useValue: options ?? {},
        },
        PolicyRegistry,
        PolicyEngine,
        {
          provide: APP_GUARD,
          useClass: PolicyGuard,
        },
      ],
      exports: [POLICY_OPTIONS, PolicyRegistry, PolicyEngine],
    };
  }

  onModuleInit() {
    // Register policies from options
    if (this.options?.policies) {
      for (const policy of this.options.policies) {
        this.registry.register(policy);
      }
    }
  }
}
