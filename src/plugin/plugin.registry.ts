import { BootPlugin } from './plugin.interface';

/**
 * PluginRegistry — collects and retrieves BootPlugin instances.
 *
 * Used by `buildBootModule()` to iterate registered plugins and
 * wire their modules into the boot assembly.
 */
export class PluginRegistry {
  private readonly plugins: BootPlugin[] = [];
  private readonly byConfigKey = new Map<string, BootPlugin>();

  /**
   * Register a plugin. Throws if a plugin with the same configKey
   * is already registered (prevents silent overwrites).
   */
  register(plugin: BootPlugin): void {
    if (this.byConfigKey.has(plugin.configKey)) {
      throw new Error(
        `BootPlugin configKey "${plugin.configKey}" is already registered ` +
          `by plugin "${this.byConfigKey.get(plugin.configKey)!.name}". ` +
          `Cannot register "${plugin.name}" with the same key.`,
      );
    }
    this.plugins.push(plugin);
    this.byConfigKey.set(plugin.configKey, plugin);
  }

  /** Return all registered plugins in registration order. */
  getAll(): readonly BootPlugin[] {
    return this.plugins;
  }

  /** Look up a plugin by its configKey, or undefined if not registered. */
  getByConfigKey(configKey: string): BootPlugin | undefined {
    return this.byConfigKey.get(configKey);
  }
}
