import { Injectable, Inject, NotFoundException, BadRequestException } from '@nestjs/common';
import { ContentEntryRepository } from '../repositories/content-entry.repository';
import { ContentTypeService } from './content-type.service';
import { ContentVersionService } from './content-version.service';
import { CONTENT_MODULE_OPTIONS } from '../constants';
import type { ContentModuleOptions } from '../interfaces/content-options.interface';
import type { IContentEntry, ContentPaginatedResult, ContentEntryFilters } from '../interfaces';
import type { EntryStatus } from '../enums/entry-status.enum';

@Injectable()
export class ContentEntryService {
  constructor(
    private readonly entryRepo: ContentEntryRepository,
    private readonly typeService: ContentTypeService,
    private readonly versionService: ContentVersionService,
    @Inject(CONTENT_MODULE_OPTIONS) private readonly options: ContentModuleOptions,
  ) {}

  async create(data: {
    contentTypeId: string;
    data: Record<string, unknown>;
    locale?: string;
    slug?: string;
    tenantId?: string;
    createdBy?: string;
  }): Promise<IContentEntry> {
    const type = await this.typeService.findById(data.contentTypeId, data.tenantId);
    const locale = data.locale ?? this.options.defaultLocale ?? 'en';

    this.validateEntryData(data.data, type.fields);

    const slug = data.slug ?? this.generateSlug(data.data, type.fields);

    const entry = await this.entryRepo.create({
      contentTypeId: data.contentTypeId,
      data: data.data,
      locale,
      slug,
      tenantId: data.tenantId,
      createdBy: data.createdBy,
    });

    // Create initial version
    await this.versionService.createVersion(entry.id, 1, entry.data, data.createdBy);

    return entry;
  }

  async findById(id: string, tenantId?: string): Promise<IContentEntry> {
    const entry = await this.entryRepo.findById(id, tenantId);
    if (!entry) throw new NotFoundException(`Entry "${id}" not found`);
    return entry;
  }

  async findBySlug(slug: string, locale: string, tenantId?: string): Promise<IContentEntry> {
    const entry = await this.entryRepo.findBySlug(slug, locale, tenantId);
    if (!entry) throw new NotFoundException(`Entry with slug "${slug}" not found`);
    return entry;
  }

  async findAll(filters: ContentEntryFilters, tenantId?: string): Promise<ContentPaginatedResult<IContentEntry>> {
    return this.entryRepo.findAll(
      { ...filters, tenantId },
      this.options.defaultPageSize ?? 25,
    );
  }

  async update(
    id: string,
    data: { data?: Record<string, unknown>; slug?: string; status?: EntryStatus },
    tenantId?: string,
    changedBy?: string,
  ): Promise<IContentEntry> {
    const entry = await this.findById(id, tenantId);

    if (data.data) {
      const type = await this.typeService.findById(entry.contentTypeId, tenantId);
      this.validateEntryData(data.data, type.fields);
    }

    // Status-only updates (restore, etc.) don't bump version
    if (data.status && !data.data && !data.slug) {
      return this.entryRepo.update(id, { status: data.status });
    }

    const newVersion = entry.version + 1;
    const updatedEntry = await this.entryRepo.update(id, {
      ...(data.data !== undefined ? { data: data.data } : {}),
      ...(data.slug !== undefined ? { slug: data.slug } : {}),
      ...(data.status !== undefined ? { status: data.status } : {}),
      version: newVersion,
    });

    await this.versionService.createVersion(id, newVersion, updatedEntry.data, changedBy);

    return updatedEntry;
  }

  async delete(id: string, tenantId?: string): Promise<IContentEntry> {
    await this.findById(id, tenantId);
    return this.entryRepo.softDelete(id);
  }

  async hardDelete(id: string): Promise<void> {
    await this.entryRepo.hardDelete(id);
  }

  async duplicate(id: string, tenantId?: string, createdBy?: string): Promise<IContentEntry> {
    const source = await this.findById(id, tenantId);
    return this.create({
      contentTypeId: source.contentTypeId,
      data: source.data,
      locale: source.locale,
      slug: source.slug ? `${source.slug}-copy` : undefined,
      tenantId,
      createdBy,
    });
  }

  private validateEntryData(data: Record<string, unknown>, fields: unknown): void {
    if (!Array.isArray(fields)) return;

    for (const field of fields) {
      if (field.validation?.required && (data[field.name] === undefined || data[field.name] === null || data[field.name] === '')) {
        throw new BadRequestException(`Field "${field.name}" is required`);
      }

      const value = data[field.name];
      if (value === undefined || value === null) continue;

      if (field.validation?.minLength && typeof value === 'string' && value.length < field.validation.minLength) {
        throw new BadRequestException(`Field "${field.name}" must be at least ${field.validation.minLength} characters`);
      }
      if (field.validation?.maxLength && typeof value === 'string' && value.length > field.validation.maxLength) {
        throw new BadRequestException(`Field "${field.name}" must be at most ${field.validation.maxLength} characters`);
      }
      if (field.validation?.min !== undefined && typeof value === 'number' && value < field.validation.min) {
        throw new BadRequestException(`Field "${field.name}" must be >= ${field.validation.min}`);
      }
      if (field.validation?.max !== undefined && typeof value === 'number' && value > field.validation.max) {
        throw new BadRequestException(`Field "${field.name}" must be <= ${field.validation.max}`);
      }
      if (field.validation?.pattern && typeof value === 'string') {
        const regex = new RegExp(field.validation.pattern);
        if (!regex.test(value)) {
          throw new BadRequestException(`Field "${field.name}" does not match pattern`);
        }
      }
    }
  }

  private generateSlug(data: Record<string, unknown>, fields: unknown): string | undefined {
    if (!Array.isArray(fields)) return undefined;

    const slugField = fields.find((f: any) => f.type === 'slug');
    if (!slugField?.slugSource) return undefined;

    const source = data[slugField.slugSource];
    if (typeof source !== 'string') return undefined;

    return source
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }
}
