import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';

export interface BulkExportResult {
  contentTypes: any[];
  components: any[];
  entries: any[];
  locales: any[];
  exportedAt: string;
  version: string;
}

export interface BulkImportResult {
  contentTypes: { created: number; skipped: number };
  components: { created: number; skipped: number };
  entries: { created: number; skipped: number; errors: string[] };
  locales: { created: number; skipped: number };
}

/**
 * Bulk import/export service for content migration.
 * Supports JSON format for full data portability.
 */
@Injectable()
export class ContentBulkService {
  private readonly logger = new Logger(ContentBulkService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Export all content data as JSON.
   */
  async exportAll(tenantId?: string): Promise<BulkExportResult> {
    const where = tenantId ? { tenantId } : {};

    const [contentTypes, components, entries, locales] = await Promise.all([
      this.prisma.client.contentType.findMany({ where, orderBy: { createdAt: 'asc' } }),
      this.prisma.client.contentComponent.findMany({ where, orderBy: { createdAt: 'asc' } }),
      this.prisma.client.contentEntry.findMany({ where, orderBy: { createdAt: 'asc' } }),
      this.prisma.client.contentLocale.findMany({ where }),
    ]);

    return {
      contentTypes,
      components,
      entries,
      locales,
      exportedAt: new Date().toISOString(),
      version: '1.0',
    };
  }

  /**
   * Export entries filtered by content type as JSON.
   */
  async exportEntries(contentTypeId?: string, tenantId?: string): Promise<any[]> {
    const where: Record<string, unknown> = {};
    if (contentTypeId) where.contentTypeId = contentTypeId;
    if (tenantId) where.tenantId = tenantId;

    return this.prisma.client.contentEntry.findMany({
      where,
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Export entries as CSV string.
   */
  async exportEntriesCsv(contentTypeId: string, tenantId?: string): Promise<string> {
    const type = await this.prisma.client.contentType.findFirst({
      where: { id: contentTypeId },
    });
    if (!type) throw new BadRequestException(`Content type "${contentTypeId}" not found`);

    const fields = typeof type.fields === 'string' ? JSON.parse(type.fields) : (type.fields as any[]);
    const fieldNames = fields.map((f: any) => f.name);

    const entries = await this.prisma.client.contentEntry.findMany({
      where: { contentTypeId, ...(tenantId ? { tenantId } : {}) },
      orderBy: { createdAt: 'asc' },
    });

    // CSV header
    const headers = ['id', 'slug', 'locale', 'status', 'version', ...fieldNames, 'createdAt', 'updatedAt'];
    const rows = [headers.join(',')];

    for (const entry of entries) {
      const data = entry.data as Record<string, unknown>;
      const row = [
        entry.id,
        entry.slug ?? '',
        entry.locale,
        entry.status,
        entry.version,
        ...fieldNames.map((name: string) => {
          const val = data[name];
          if (val === null || val === undefined) return '';
          if (typeof val === 'object') return `"${JSON.stringify(val).replace(/"/g, '""')}"`;
          return `"${String(val).replace(/"/g, '""')}"`;
        }),
        entry.createdAt,
        entry.updatedAt,
      ];
      rows.push(row.join(','));
    }

    return rows.join('\n');
  }

  /**
   * Import content data from JSON export.
   * Uses upsert — existing records (by slug+tenant) are skipped.
   */
  async importAll(data: BulkExportResult, tenantId?: string): Promise<BulkImportResult> {
    const result: BulkImportResult = {
      contentTypes: { created: 0, skipped: 0 },
      components: { created: 0, skipped: 0 },
      entries: { created: 0, skipped: 0, errors: [] },
      locales: { created: 0, skipped: 0 },
    };

    // Import locales
    for (const locale of data.locales ?? []) {
      try {
        const existing = await this.prisma.client.contentLocale.findFirst({
          where: { code: locale.code, tenantId: tenantId ?? locale.tenantId ?? null },
        });
        if (existing) { result.locales.skipped++; continue; }

        await this.prisma.client.contentLocale.create({
          data: {
            code: locale.code,
            name: locale.name,
            isDefault: locale.isDefault ?? false,
            fallbackLocale: locale.fallbackLocale,
            tenantId: tenantId ?? locale.tenantId,
          },
        });
        result.locales.created++;
      } catch {
        result.locales.skipped++;
      }
    }

    // Import components
    for (const comp of data.components ?? []) {
      try {
        const existing = await this.prisma.client.contentComponent.findFirst({
          where: { slug: comp.slug, tenantId: tenantId ?? comp.tenantId ?? null },
        });
        if (existing) { result.components.skipped++; continue; }

        await this.prisma.client.contentComponent.create({
          data: {
            name: comp.name,
            slug: comp.slug,
            fields: typeof comp.fields === 'string' ? comp.fields : JSON.stringify(comp.fields),
            tenantId: tenantId ?? comp.tenantId,
          },
        });
        result.components.created++;
      } catch {
        result.components.skipped++;
      }
    }

    // Import content types
    const typeIdMap = new Map<string, string>(); // old ID → new ID
    for (const type of data.contentTypes ?? []) {
      try {
        const existing = await this.prisma.client.contentType.findFirst({
          where: { slug: type.slug, tenantId: tenantId ?? type.tenantId ?? null },
        });
        if (existing) {
          typeIdMap.set(type.id, existing.id);
          result.contentTypes.skipped++;
          continue;
        }

        const created = await this.prisma.client.contentType.create({
          data: {
            name: type.name,
            slug: type.slug,
            description: type.description,
            fields: typeof type.fields === 'string' ? type.fields : JSON.stringify(type.fields),
            components: type.components ?? [],
            tenantId: tenantId ?? type.tenantId,
          },
        });
        typeIdMap.set(type.id, created.id);
        result.contentTypes.created++;
      } catch {
        result.contentTypes.skipped++;
      }
    }

    // Import entries
    for (const entry of data.entries ?? []) {
      try {
        const contentTypeId = typeIdMap.get(entry.contentTypeId) ?? entry.contentTypeId;

        await this.prisma.client.contentEntry.create({
          data: {
            contentTypeId,
            data: entry.data,
            locale: entry.locale ?? 'en',
            status: entry.status ?? 'DRAFT',
            version: entry.version ?? 1,
            slug: entry.slug,
            publishedAt: entry.publishedAt ? new Date(entry.publishedAt) : null,
            tenantId: tenantId ?? entry.tenantId,
            createdBy: entry.createdBy,
          },
        });
        result.entries.created++;
      } catch (err) {
        result.entries.skipped++;
        result.entries.errors.push(`Entry ${entry.slug ?? entry.id}: ${err}`);
      }
    }

    this.logger.log(
      `Import complete: ${result.contentTypes.created} types, ${result.components.created} components, ${result.entries.created} entries, ${result.locales.created} locales`,
    );

    return result;
  }

  /**
   * Import entries from CSV string.
   */
  async importEntriesCsv(csv: string, contentTypeId: string, tenantId?: string): Promise<{ created: number; errors: string[] }> {
    const lines = csv.split('\n').filter(Boolean);
    if (lines.length < 2) throw new BadRequestException('CSV must have header + at least 1 row');

    const headers = this.parseCsvLine(lines[0]);
    const result = { created: 0, errors: [] as string[] };

    for (let i = 1; i < lines.length; i++) {
      try {
        const values = this.parseCsvLine(lines[i]);
        const record: Record<string, unknown> = {};
        headers.forEach((h, idx) => { record[h] = values[idx] ?? ''; });

        const data: Record<string, unknown> = {};
        const systemFields = ['id', 'slug', 'locale', 'status', 'version', 'createdAt', 'updatedAt'];
        for (const [key, value] of Object.entries(record)) {
          if (!systemFields.includes(key)) {
            // Try parse JSON values
            try { data[key] = JSON.parse(value as string); } catch { data[key] = value; }
          }
        }

        await this.prisma.client.contentEntry.create({
          data: {
            contentTypeId,
            data,
            locale: (record.locale as string) ?? 'en',
            status: 'DRAFT',
            slug: (record.slug as string) || undefined,
            tenantId,
          },
        });
        result.created++;
      } catch (err) {
        result.errors.push(`Row ${i + 1}: ${err}`);
      }
    }

    return result;
  }

  private parseCsvLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current);
    return result;
  }
}
