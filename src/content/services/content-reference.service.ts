import { Injectable, Inject } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';
import { CONTENT_MODULE_OPTIONS } from '../constants';
import type { ContentModuleOptions } from '../interfaces/content-options.interface';
import type { IContentEntry, IContentType, ContentFieldDefinition } from '../interfaces';

/**
 * Resolves cross-entry references in content data.
 * Walks entry JSONB data, finds reference fields (by content type schema),
 * and replaces IDs with resolved entry data up to configurable depth.
 */
@Injectable()
export class ContentReferenceService {
  private readonly maxDepth: number;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(CONTENT_MODULE_OPTIONS) options: ContentModuleOptions,
  ) {
    this.maxDepth = options.maxPopulateDepth ?? 3;
  }

  /**
   * Resolve references in a single entry.
   * @param entry - The entry to resolve references for
   * @param populateFields - Specific fields to populate (or '*' for all)
   * @param depth - Current resolution depth
   */
  async resolveReferences(
    entry: IContentEntry,
    contentType: IContentType,
    populateFields?: string[],
    depth = 0,
  ): Promise<IContentEntry> {
    if (depth >= this.maxDepth) return entry;

    const fields = this.parseFields(contentType.fields);
    const refFields = fields.filter((f) =>
      f.type === 'reference' && (populateFields?.includes('*') || populateFields?.includes(f.name) || !populateFields),
    );

    if (refFields.length === 0) return entry;

    const resolvedData = { ...entry.data };

    for (const field of refFields) {
      const value = resolvedData[field.name];
      if (!value) continue;

      if (field.referenceConfig?.multiple && Array.isArray(value)) {
        // Resolve array of reference IDs
        const ids = value as string[];
        const resolved = await this.resolveIds(ids, entry.locale, entry.tenantId, populateFields, depth);
        resolvedData[field.name] = resolved;
      } else if (typeof value === 'string') {
        // Resolve single reference ID
        const resolved = await this.resolveId(value, entry.locale, entry.tenantId, populateFields, depth);
        resolvedData[field.name] = resolved;
      }
    }

    return { ...entry, data: resolvedData };
  }

  /**
   * Resolve references for a list of entries.
   */
  async resolveMany(
    entries: IContentEntry[],
    contentTypes: Map<string, IContentType>,
    populateFields?: string[],
  ): Promise<IContentEntry[]> {
    return Promise.all(
      entries.map(async (entry) => {
        const type = contentTypes.get(entry.contentTypeId);
        if (!type) return entry;
        return this.resolveReferences(entry, type, populateFields);
      }),
    );
  }

  private async resolveId(
    id: string,
    _locale: string,
    _tenantId?: string,
    populateFields?: string[],
    depth = 0,
  ): Promise<IContentEntry | null> {
    const entry = await this.prisma.client.contentEntry.findFirst({
      where: { id, status: 'PUBLISHED' },
    });
    if (!entry) return null;

    // Recursively resolve nested references
    if (depth + 1 < this.maxDepth && populateFields) {
      const type = await this.prisma.client.contentType.findFirst({
        where: { id: entry.contentTypeId },
      });
      if (type) {
        return this.resolveReferences(entry, type, populateFields, depth + 1);
      }
    }

    return entry;
  }

  private async resolveIds(
    ids: string[],
    locale: string,
    tenantId?: string,
    populateFields?: string[],
    depth = 0,
  ): Promise<(IContentEntry | null)[]> {
    return Promise.all(
      ids.map((id) => this.resolveId(id, locale, tenantId, populateFields, depth)),
    );
  }

  private parseFields(fields: unknown): ContentFieldDefinition[] {
    if (Array.isArray(fields)) return fields;
    if (typeof fields === 'string') return JSON.parse(fields);
    return [];
  }
}
