import { DynamicModule, Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AUDIT_STORE, AUDIT_OPTIONS } from './constants';
import { AuditModuleOptions, AuditModuleAsyncOptions } from './interfaces';
import { MemoryAuditStore } from './memory-audit.store';
import { AuditService } from './audit.service';
import { AuditInterceptor } from './audit.interceptor';

@Global()
@Module({})
export class AuditModule {
  static register(options?: AuditModuleOptions): DynamicModule {
    const store = options?.store ?? new MemoryAuditStore();
    const providers: any[] = [
      { provide: AUDIT_OPTIONS, useValue: options ?? {} },
      { provide: AUDIT_STORE, useValue: store },
      AuditService,
    ];

    // Auto-register interceptor for denial logging
    if (options?.logDenials !== false) {
      providers.push({ provide: APP_INTERCEPTOR, useClass: AuditInterceptor });
    }

    return {
      module: AuditModule,
      global: true,
      providers,
      exports: [AUDIT_STORE, AuditService],
    };
  }

  static registerAsync(options: AuditModuleAsyncOptions): DynamicModule {
    const providers: any[] = [
      {
        provide: AUDIT_OPTIONS,
        useFactory: options.useFactory,
        inject: options.inject ?? [],
      },
      {
        provide: AUDIT_STORE,
        useFactory: (opts: AuditModuleOptions) => opts.store ?? new MemoryAuditStore(),
        inject: [AUDIT_OPTIONS],
      },
      AuditService,
      { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
    ];

    return {
      module: AuditModule,
      global: true,
      imports: options.imports ?? [],
      providers,
      exports: [AUDIT_STORE, AuditService],
    };
  }
}
