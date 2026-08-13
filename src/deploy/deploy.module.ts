import { DynamicModule, Inject, Module, OnModuleInit, Logger, Injectable } from '@nestjs/common';
import { DiscoveryModule, DiscoveryService } from '@nestjs/core';
import 'reflect-metadata';
import { DeployService } from './deploy.service';
import { DeployOptions } from './interfaces';
import { DEPLOY_HOOK_METADATA, DeployHookMetadata } from './decorators';

export const DEPLOY_OPTIONS = 'DEPLOY_OPTIONS';

@Injectable()
export class DeployHookScanner implements OnModuleInit {
  private readonly logger = new Logger(DeployHookScanner.name);

  constructor(
    @Inject(DeployService) private readonly deployService: DeployService,
    @Inject(DiscoveryService) private readonly discoveryService: DiscoveryService,
  ) {}

  onModuleInit(): void {
    const wrappers = this.discoveryService.getProviders();

    for (const wrapper of wrappers) {
      const instance = wrapper.instance;
      if (!instance || typeof instance !== 'object') continue;

      const prototype = Object.getPrototypeOf(instance);
      if (!prototype) continue;

      const hooks: DeployHookMetadata[] =
        Reflect.getMetadata(DEPLOY_HOOK_METADATA, prototype) ?? [];

      for (const meta of hooks) {
        const className = instance.constructor?.name ?? 'Unknown';
        this.deployService.registerHook({
          name: `${className}.${String(meta.methodName)}`,
          phase: meta.phase,
          order: meta.order,
          execute: (ctx) => instance[meta.methodName as string](ctx),
        });
      }
    }

    this.logger.log(`Scanned and registered decorator-based deploy hooks`);
  }
}

@Module({})
export class DeployHooksModule {
  static register(options: DeployOptions = {}): DynamicModule {
    return {
      module: DeployHooksModule,
      imports: [DiscoveryModule],
      providers: [
        DeployService,
        DeployHookScanner,
        { provide: DEPLOY_OPTIONS, useValue: options },
      ],
      exports: [DeployService],
      global: true,
    };
  }
}
