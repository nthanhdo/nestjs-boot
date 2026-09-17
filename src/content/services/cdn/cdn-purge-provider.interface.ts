/**
 * Abstract CDN purge provider interface.
 */
export interface CdnPurgeProvider {
  /** Purge specific URL paths from CDN cache. */
  purgePaths(paths: string[]): Promise<void>;

  /** Purge everything (full cache invalidation). */
  purgeAll(): Promise<void>;
}
