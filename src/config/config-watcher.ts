/**
 * ConfigWatcher — watches a .env file for changes and notifies the caller.
 *
 * **DEV MODE ONLY.** This class must never be used in production.
 * It does NOT auto-reload config (too risky — DI container already holds
 * all injected values). Instead it logs a reminder to restart the process.
 *
 * ```ts
 * // In main.ts (dev only):
 * if (process.env.NODE_ENV !== 'production') {
 *   const watcher = new ConfigWatcher();
 *   watcher.watch('.env', () => {
 *     console.warn('[nestjs-boot] .env changed. Restart the server to apply new config.');
 *   });
 * }
 * ```
 */
export class ConfigWatcher {
  private readonly watchers: Array<{ close(): void }> = [];

  /**
   * Watch a file path for changes.
   *
   * Uses `fs.watch` (Node built-in). No external dependencies.
   * Calls `onChange` whenever the file is modified or renamed.
   *
   * Multiple calls to `watch()` are supported — each adds a new watcher.
   *
   * @param envPath  - Path to the .env file to watch
   * @param onChange - Callback invoked when the file changes
   *
   * @throws {Error} If called in production (NODE_ENV === 'production')
   * @throws {Error} If the file does not exist
   */
  watch(envPath: string, onChange: (path: string) => void): void {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        `[nestjs-boot] ConfigWatcher.watch() called in production. ` +
          `This is not allowed — config watchers are for development only.\n` +
          `  Remove the watcher call or guard it with: if (process.env.NODE_ENV !== 'production')`,
      );
    }

    const fs: typeof import('fs') = require('fs');
    const { resolve } = require('path');

    const absolutePath = resolve(envPath);

    if (!fs.existsSync(absolutePath)) {
      throw new Error(
        `[nestjs-boot] ConfigWatcher: File not found: "${absolutePath}". ` +
          `Cannot watch a file that does not exist.`,
      );
    }

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const w = fs.watch(absolutePath, { persistent: false }, (event) => {
      if (event === 'change' || event === 'rename') {
        // Debounce rapid events (editors often write multiple times per save)
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          onChange(absolutePath);
          debounceTimer = null;
        }, 100);
      }
    });

    this.watchers.push(w);
  }

  /**
   * Stop all active file watchers.
   * Call this in your app's shutdown hook.
   *
   * ```ts
   * watcher.stop();
   * ```
   */
  stop(): void {
    for (const w of this.watchers) {
      try {
        w.close();
      } catch {
        // ignore errors on close
      }
    }
    this.watchers.length = 0;
  }
}

/**
 * Create a dev-only config watcher that logs a restart reminder when .env changes.
 *
 * Convenience wrapper around `ConfigWatcher` for the common case.
 *
 * ```ts
 * // main.ts
 * const watcher = createDevConfigWatcher(['.env', `.env.${process.env.NODE_ENV}`]);
 * // Later in shutdown:
 * watcher.stop();
 * ```
 */
export function createDevConfigWatcher(envPaths: string | string[]): ConfigWatcher {
  const watcher = new ConfigWatcher();
  const paths = Array.isArray(envPaths) ? envPaths : [envPaths];

  for (const envPath of paths) {
    const { existsSync } = require('fs') as typeof import('fs');
    const { resolve: resolvePath } = require('path') as typeof import('path');
    if (!existsSync(resolvePath(envPath))) {
      continue; // skip non-existent files silently
    }

    watcher.watch(envPath, (changedPath) => {
      process.stderr.write(
        `\n[nestjs-boot] ⚠️  Config file changed: ${changedPath}\n` +
          `  Config is NOT hot-reloaded. Restart the server to apply changes.\n\n`,
      );
    });
  }

  return watcher;
}
