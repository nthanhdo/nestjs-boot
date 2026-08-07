import { Inject, Injectable } from '@nestjs/common';
import { BootOptions } from '../interfaces/boot-options.interface';
import { BOOT_OPTIONS } from './constants';
import { bootOptionsSchema } from './validators';

/**
 * Utility type to generate dot-notation paths from a nested object type.
 * Provides autocomplete for `config.get('database.connections.master.writerUri')`.
 */
type PathsOf<T, Prefix extends string = ''> = T extends Record<string, any>
  ? {
      [K in keyof T & string]: T[K] extends Record<string, any>
        ? `${Prefix}${K}` | PathsOf<T[K], `${Prefix}${K}.`>
        : `${Prefix}${K}`;
    }[keyof T & string]
  : never;

/** Known config paths derived from BootOptions interface. */
export type BootConfigPath = PathsOf<BootOptions>;

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
   *
   * Supports autocomplete for known BootOptions paths.
   */
  get<T = unknown>(path: BootConfigPath | (string & {})): T | undefined {
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
  getOrThrow<T = unknown>(path: BootConfigPath | (string & {})): T {
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

  /**
   * Get the Joi schema definition as a describable object.
   * Returns all valid config keys, types, defaults, and constraints.
   *
   * ```ts
   * const schema = configService.getSchema();
   * console.log(JSON.stringify(schema, null, 2));
   * // { type: 'object', keys: { database: { type: 'object', ... }, ... } }
   * ```
   */
  getSchema(): Record<string, unknown> {
    return bootOptionsSchema.describe();
  }
}
