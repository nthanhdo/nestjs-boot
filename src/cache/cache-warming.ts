import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { MultiCacheService } from './multi-cache.service';

export interface CacheWarmEntry<T = unknown> {
  /** Cache key */
  key: string;
  /** Factory that produces the value to cache */
  factory: () => Promise<T>;
  /** TTL in seconds */
  ttl?: number;
  /** Warm this entry on module init (default: false) */
  warmOnStart?: boolean;
  /**
   * Cron expression for scheduled re-warming.
   * NOTE: scheduling requires @nestjs/schedule to be configured separately.
   * The CacheWarmer stores the expression for reference; the caller is responsible
   * for wiring the cron trigger (e.g. using @Cron on their own service).
   */
  cron?: string;
}

/**
 * Pre-populate cache on startup or on demand.
 *
 * Eliminates cold-start latency for critical data (categories, settings, etc.)
 * by fetching from source and caching before the first request arrives.
 *
 * @example
 * ```ts
 * // In your module:
 * warmer.register([
 *   { key: 'categories', factory: () => db.find({}), ttl: 3600, warmOnStart: true },
 *   { key: 'settings',   factory: () => db.findOne({}), ttl: 600 },
 * ]);
 * ```
 */
@Injectable()
export class CacheWarmer implements OnModuleInit {
  private readonly logger = new Logger('CacheWarmer');
  private entries: CacheWarmEntry[] = [];

  constructor(private readonly cache: MultiCacheService) {}

  /** Register entries to warm (can be called multiple times before onModuleInit) */
  register(entries: CacheWarmEntry[]): void {
    this.entries.push(...entries);
  }

  /** Called automatically by NestJS on module init */
  async onModuleInit(): Promise<void> {
    const onStartEntries = this.entries.filter((e) => e.warmOnStart);
    if (onStartEntries.length === 0) return;

    this.logger.log(`Warming ${onStartEntries.length} cache entries on startup...`);
    await Promise.allSettled(
      onStartEntries.map((entry) => this.warmEntry(entry)),
    );
    this.logger.log('Cache warm-up complete');
  }

  /** Warm all registered entries (manual trigger) */
  async warmAll(): Promise<void> {
    this.logger.log(`Warming all ${this.entries.length} cache entries...`);
    await Promise.allSettled(this.entries.map((e) => this.warmEntry(e)));
  }

  /** Warm a single entry by key */
  async warmKey(key: string): Promise<void> {
    const entry = this.entries.find((e) => e.key === key);
    if (!entry) {
      this.logger.warn(`CacheWarmer: no entry registered for key="${key}"`);
      return;
    }
    await this.warmEntry(entry);
  }

  private async warmEntry(entry: CacheWarmEntry): Promise<void> {
    try {
      const value = await entry.factory();
      await this.cache.set(entry.key, value, { ttl: entry.ttl });
      this.logger.debug(`Warmed key="${entry.key}" ttl=${entry.ttl ?? 'default'}`);
    } catch (err) {
      this.logger.error(
        `Failed to warm key="${entry.key}": ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /** Returns all registered entries (for inspection / cron wiring) */
  getEntries(): readonly CacheWarmEntry[] {
    return this.entries;
  }
}
