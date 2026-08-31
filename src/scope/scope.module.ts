import { DynamicModule, Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { SCOPE_OPTIONS } from './constants';
import { ScopeModuleOptions } from './interfaces';
import { ScopeResolver } from './scope.resolver';
import { ScopeGuard } from './scope.guard';

@Global()
@Module({})
export class ScopeModule {
  static register(options?: ScopeModuleOptions): DynamicModule {
    return {
      module: ScopeModule,
      global: true,
      providers: [
        {
          provide: SCOPE_OPTIONS,
          useValue: options ?? {},
        },
        ScopeResolver,
        {
          provide: APP_GUARD,
          useClass: ScopeGuard,
        },
      ],
      exports: [SCOPE_OPTIONS, ScopeResolver],
    };
  }
}
