import { DynamicModule, Global, Module } from '@nestjs/common';
import { BootOptions } from '../interfaces/boot-options.interface';
import { BootConfigService } from './config.service';
import { BOOT_OPTIONS } from './constants';
import { validateBootOptions } from './validators';

/**
 * BootConfigModule — validates and provides the BootOptions config globally.
 *
 * Usage:
 * ```ts
 * BootConfigModule.register({ database: { ... }, cache: { ... } })
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
}
