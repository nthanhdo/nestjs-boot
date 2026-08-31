import { DynamicModule, Global, Module, OnModuleInit, Inject, Optional, Provider } from '@nestjs/common';
import { APP_GUARD, ModuleRef } from '@nestjs/core';
import { POLICY_OPTIONS } from './constants';
import { AuthorizationPolicy, AuthorizationPolicyClass, PolicyModuleOptions } from './interfaces';
import { PolicyRegistry } from './policy.registry';
import { PolicyEngine } from './policy.engine';
import { PolicyGuard } from './policy.guard';

@Global()
@Module({})
export class PolicyModule implements OnModuleInit {
  constructor(
    private readonly registry: PolicyRegistry,
    private readonly moduleRef: ModuleRef,
    @Optional() @Inject(POLICY_OPTIONS) private readonly options?: PolicyModuleOptions,
  ) {}

  static register(options?: PolicyModuleOptions): DynamicModule {
    const policyProviders: Provider[] = (options?.policies ?? [])
      .filter((p): p is AuthorizationPolicyClass => typeof p === 'function')
      .map(cls => ({ provide: cls, useClass: cls }));

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
        ...policyProviders,
      ],
      exports: [POLICY_OPTIONS, PolicyRegistry, PolicyEngine, ...policyProviders],
    };
  }

  async onModuleInit() {
    if (!this.options?.policies) return;

    for (const policyOrClass of this.options.policies) {
      if (typeof policyOrClass === 'function') {
        // Class reference — resolve via DI
        const instance = await this.moduleRef.resolve(policyOrClass);
        this.registry.register(instance as AuthorizationPolicy);
      } else {
        // Instance — register directly
        this.registry.register(policyOrClass);
      }
    }
  }
}
