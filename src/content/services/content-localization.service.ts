import { Injectable, Inject } from '@nestjs/common';
import { ContentLocaleRepository } from '../repositories/content-locale.repository';
import { ContentEntryRepository } from '../repositories/content-entry.repository';
import { CONTENT_MODULE_OPTIONS } from '../constants';
import type { ContentModuleOptions } from '../interfaces/content-options.interface';
import type { IContentEntry } from '../interfaces';

@Injectable()
export class ContentLocalizationService {
  constructor(
    private readonly localeRepo: ContentLocaleRepository,
    private readonly entryRepo: ContentEntryRepository,
    @Inject(CONTENT_MODULE_OPTIONS) private readonly options: ContentModuleOptions,
  ) {}

  /**
   * Resolve entry with locale fallback chain.
   * Tries requested locale first, then walks fallback chain, then default locale.
   */
  async resolveWithFallback(
    entryId: string,
    requestedLocale: string,
    tenantId?: string,
  ): Promise<IContentEntry | null> {
    // Try exact locale
    const entry = await this.entryRepo.findById(entryId, tenantId);
    if (!entry) return null;

    if (entry.locale === requestedLocale) return entry;

    // Build fallback chain
    const chain = await this.buildFallbackChain(requestedLocale, tenantId);

    // Try each locale in the chain
    for (const locale of chain) {
      // Look for same content (same slug + type) in fallback locale
      if (entry.slug) {
        const fallback = await this.entryRepo.findBySlug(entry.slug, locale, tenantId);
        if (fallback) return fallback;
      }
    }

    return entry; // Return original if no fallback found
  }

  /**
   * Merge field-level localization: for each localizable field,
   * if the field is empty in the target locale, use the fallback locale value.
   */
  async mergeFieldFallback(
    targetEntry: IContentEntry,
    fallbackEntry: IContentEntry,
    localizableFields: string[],
  ): Promise<Record<string, unknown>> {
    const merged = { ...targetEntry.data };

    for (const fieldName of localizableFields) {
      if (merged[fieldName] === undefined || merged[fieldName] === null || merged[fieldName] === '') {
        if (fallbackEntry.data[fieldName] !== undefined) {
          merged[fieldName] = fallbackEntry.data[fieldName];
        }
      }
    }

    return merged;
  }

  /**
   * Build fallback chain: locale -> fallback -> fallback's fallback -> default
   */
  async buildFallbackChain(locale: string, tenantId?: string): Promise<string[]> {
    const chain: string[] = [];
    const visited = new Set<string>();
    let current = locale;

    while (current && !visited.has(current)) {
      visited.add(current);
      const localeConfig = await this.localeRepo.findByCode(current, tenantId);
      if (localeConfig?.fallbackLocale) {
        chain.push(localeConfig.fallbackLocale);
        current = localeConfig.fallbackLocale;
      } else {
        break;
      }
    }

    // Always end with default locale
    const defaultLocale = this.options.defaultLocale ?? 'en';
    if (!chain.includes(defaultLocale)) {
      chain.push(defaultLocale);
    }

    return chain;
  }

  /** Get translation status for an entry across all locales */
  async getTranslationStatus(
    slug: string,
    _contentTypeId: string,
    tenantId?: string,
  ): Promise<Record<string, boolean>> {
    const locales = await this.localeRepo.findAll(tenantId);
    const status: Record<string, boolean> = {};

    for (const locale of locales) {
      const entry = await this.entryRepo.findBySlug(slug, locale.code, tenantId);
      status[locale.code] = !!entry;
    }

    return status;
  }
}
