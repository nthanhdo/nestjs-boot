import { ConfigSource } from './adapters/config-source.interface';

/**
 * Deep-merge two plain objects.
 * Values from `overrides` win over `base`.
 * Arrays are replaced (not concatenated) to keep merge semantics predictable.
 */
function deepMerge(base: Record<string, unknown>, overrides: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = { ...base };

  for (const key of Object.keys(overrides)) {
    const baseVal = result[key];
    const overVal = overrides[key];

    if (
      overVal !== null &&
      typeof overVal === 'object' &&
      !Array.isArray(overVal) &&
      baseVal !== null &&
      typeof baseVal === 'object' &&
      !Array.isArray(baseVal)
    ) {
      result[key] = deepMerge(
        baseVal as Record<string, unknown>,
        overVal as Record<string, unknown>,
      );
    } else {
      result[key] = overVal;
    }
  }

  return result;
}

/**
 * Merge config from multiple sources in priority order.
 *
 * **Priority (low → high — later sources win):**
 * 1. Earlier sources in the array (e.g. `.env` file defaults)
 * 2. Later sources in the array (e.g. `.env.production` overrides)
 * 3. External sources (Vault, AWS SM) — if placed last in the array
 * 4. `process.env` — always wins (applied last, outside this function)
 * 5. Explicit `BootOptions` passed to `createApp()` — final authority
 *
 * Each source is loaded independently. If one source fails, an error is thrown
 * with the source name for easy debugging.
 *
 * ```ts
 * const merged = await mergeConfigs([
 *   new EnvFileAdapter('.env'),
 *   new EnvFileAdapter('.env.production'),
 *   new VaultAdapter({ url: '...', token: '...', path: '...' }),
 * ]);
 * // Vault values override .env.production which overrides .env
 * ```
 */
export async function mergeConfigs(
  sources: ConfigSource[],
): Promise<Record<string, unknown>> {
  let merged: Record<string, unknown> = {};

  for (const source of sources) {
    let values: Record<string, unknown>;
    try {
      values = await source.load();
    } catch (err: any) {
      throw new Error(
        `[nestjs-boot] ConfigSource "${source.name}" failed to load.\n  ${err?.message ?? String(err)}`,
      );
    }

    if (values && typeof values === 'object' && !Array.isArray(values)) {
      merged = deepMerge(merged, values);
    }
  }

  return merged;
}
