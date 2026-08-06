import { Inject, Injectable } from '@nestjs/common';
import { BootOptions } from '../interfaces/boot-options.interface';
import { BOOT_OPTIONS } from './constants';

/**
 * Typed access to the validated BootOptions config.
 * Supports dot-notation paths: `config.get('database.connections.master.writerUri')`
 */
@Injectable()
export class BootConfigService {
  constructor(
    @Inject(BOOT_OPTIONS)
    private readonly options: BootOptions,
  ) {}

  /**
   * Get a config value by dot-notation path.
   * Returns `undefined` if the path doesn't exist.
   */
  get<T = unknown>(path: string): T | undefined {
    const segments = path.split('.');
    let current: unknown = this.options;

    for (const segment of segments) {
      if (current === null || current === undefined || typeof current !== 'object') {
        return undefined;
      }
      current = (current as Record<string, unknown>)[segment];
    }

    return current as T | undefined;
  }

  /**
   * Get a config value by dot-notation path.
   * Throws if the path doesn't exist.
   */
  getOrThrow<T = unknown>(path: string): T {
    const value = this.get<T>(path);
    if (value === undefined) {
      throw new Error(`[nestjs-boot] Config path "${path}" is not defined`);
    }
    return value;
  }

  /**
   * Get the full validated BootOptions object.
   */
  getAll(): Readonly<BootOptions> {
    return this.options;
  }
}
