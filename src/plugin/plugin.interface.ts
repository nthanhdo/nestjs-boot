import { DynamicModule } from '@nestjs/common';
import { INestApplication } from '@nestjs/common';

/**
 * BootPlugin — extension point for nestjs-boot.
 *
 * Plugins register infrastructure modules into the boot assembly
 * without modifying `create-app.ts`. Each plugin owns a config key
 * in BootOptions; when that key is present, the plugin's module is
 * loaded automatically.
 *
 * ```ts
 * const myPlugin: BootPlugin = {
 *   name: 'my-plugin',
 *   configKey: 'myPlugin',
 *   register: (options) => MyModule.register(options),
 * };
 * ```
 */
export interface BootPlugin {
  /** Human-readable plugin name (used in logs and diagnostics). */
  readonly name: string;

  /**
   * The key in BootOptions that activates this plugin.
   * When `options[configKey]` is truthy, `register()` is called.
   */
  readonly configKey: string;

  /**
   * Optional Joi schema to validate the plugin's config section.
   * Merged into the top-level boot options validation when present.
   */
  configSchema?: import('joi').Schema;

  /**
   * Return a DynamicModule to be added to the boot assembly's imports.
   * Called only when `options[configKey]` is present and truthy.
   */
  register(options: unknown): DynamicModule;

  /**
   * Optional hook to apply global pipes, interceptors, filters, or
   * other app-level setup after NestFactory.create().
   */
  applyGlobals?(app: INestApplication): void;
}
