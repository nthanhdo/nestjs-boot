import { DynamicModule, Global, Module, Provider, Type } from '@nestjs/common';
import { BootOptions } from '../interfaces/boot-options.interface';
import { BootConfigService } from './config.service';
import { BOOT_OPTIONS } from './constants';
import { validateBootOptions } from './validators';

/**
 * Async config factory options — enables loading config from
 * AWS Secrets Manager, HashiCorp Vault, GCP Secret Manager, etc.
 */
export interface BootConfigAsyncOptions {
  /**
   * Optional modules to import (e.g., a VaultModule that provides VaultService).
   */
  imports?: Type<unknown>[];
  /**
   * Tokens to inject into the factory function.
   */
  inject?: any[];
  /**
   * Async factory that returns BootOptions.
   *
   * ```ts
   * BootConfigModule.registerAsync({
   *   imports: [VaultModule],
   *   inject: [VaultService],
   *   useFactory: async (vault: VaultService) => {
   *     const secrets = await vault.getSecrets('my-service');
   *     return { database: { connections: { master: { writerUri: secrets.MONGO_URI } } } };
   *   },
   * })
   * ```
   */
  useFactory: (...args: any[]) => Promise<BootOptions> | BootOptions;
}

/**
 * BootConfigModule — validates and provides the BootOptions config globally.
 *
 * Usage:
 * ```ts
 * // Synchronous
 * BootConfigModule.register({ database: { ... }, cache: { ... } })
 *
 * // Asynchronous (e.g., from Vault)
 * BootConfigModule.registerAsync({
 *   useFactory: async () => loadFromVault(),
 * })
 * ```
 */
@Global()
@Module({})
export class BootConfigModule {
  static register(options: BootOptions): DynamicModule {
    const validated = validateBootOptions(options);

    return {
      module: BootConfigModule,
      global: true,
      providers: [
        {
          provide: BOOT_OPTIONS,
          useValue: validated,
        },
        BootConfigService,
      ],
      exports: [BOOT_OPTIONS, BootConfigService],
    };
  }

  /**
   * Register with an async factory — enables loading config from
   * external secret managers at startup.
   */
  static registerAsync(asyncOptions: BootConfigAsyncOptions): DynamicModule {
    const asyncProvider: Provider = {
      provide: BOOT_OPTIONS,
      inject: asyncOptions.inject || [],
      useFactory: async (...args: any[]) => {
        const raw = await asyncOptions.useFactory(...args);
        return validateBootOptions(raw);
      },
    };

    return {
      module: BootConfigModule,
      global: true,
      imports: asyncOptions.imports || [],
      providers: [asyncProvider, BootConfigService],
      exports: [BOOT_OPTIONS, BootConfigService],
    };
  }
}
