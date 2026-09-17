import { Injectable, Inject, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';
import { CONTENT_MODULE_OPTIONS } from '../constants';
import type { ContentModuleOptions } from '../interfaces/content-options.interface';
import type { IContentEntry, ContentPaginatedResult } from '../interfaces';

/**
 * PostgreSQL full-text search service using tsvector, pg_trgm, and unaccent.
 * Requires PostgreSQL extensions: pg_trgm, unaccent.
 *
 * Setup SQL (run once):
 * ```sql
 * CREATE EXTENSION IF NOT EXISTS pg_trgm;
 * CREATE EXTENSION IF NOT EXISTS unaccent;
 * ```
 */
@Injectable()
export class ContentSearchService {
  private readonly logger = new Logger(ContentSearchService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(CONTENT_MODULE_OPTIONS) private readonly options: ContentModuleOptions,
  ) {}

  /**
   * Full-text search across content entries using PostgreSQL.
   * Uses tsvector for full-text, pg_trgm for fuzzy/typo-tolerant, unaccent for Vietnamese diacritics.
   */
  async search(params: {
    query: string;
    contentTypeId?: string;
    locale?: string;
    status?: string;
    tenantId?: string;
    page?: number;
    pageSize?: number;
  }): Promise<ContentPaginatedResult<IContentEntry & { rank?: number }>> {
    if (!this.options.enableSearch) {
      return { data: [], meta: { total: 0, page: 1, pageSize: 25, totalPages: 0 } };
    }

    const page = params.page ?? 1;
    const pageSize = params.pageSize ?? this.options.defaultPageSize ?? 25;
    const offset = (page - 1) * pageSize;

    // Sanitize query for tsquery
    const sanitized = params.query.replace(/[^\w\s\u00C0-\u024F]/g, '').trim();
    if (!sanitized) {
      return { data: [], meta: { total: 0, page, pageSize, totalPages: 0 } };
    }

    // Build tsquery tokens
    const tokens = sanitized.split(/\s+/).filter(Boolean).map((t) => `${t}:*`).join(' & ');

    try {
      // Full-text search with ranking + trigram similarity fallback
      const conditions: string[] = ['1=1'];
      const values: unknown[] = [];
      let paramIdx = 1;

      if (params.tenantId) {
        conditions.push(`e.tenant_id = $${paramIdx++}`);
        values.push(params.tenantId);
      }
      if (params.contentTypeId) {
        conditions.push(`e.content_type_id = $${paramIdx++}`);
        values.push(params.contentTypeId);
      }
      if (params.locale) {
        conditions.push(`e.locale = $${paramIdx++}`);
        values.push(params.locale);
      }
      if (params.status) {
        conditions.push(`e.status = $${paramIdx++}`);
        values.push(params.status);
      }

      const whereClause = conditions.join(' AND ');
      const queryParam = `$${paramIdx++}`;
      values.push(tokens);
      const rawQuery = `$${paramIdx++}`;
      values.push(sanitized);
      const limitParam = `$${paramIdx++}`;
      values.push(pageSize);
      const offsetParam = `$${paramIdx++}`;
      values.push(offset);

      // Search using both tsvector (exact) and trigram (fuzzy)
      const sql = `
        SELECT e.*,
          ts_rank(
            to_tsvector('simple', unaccent(e.data::text)),
            to_tsquery('simple', unaccent(${queryParam}))
          ) AS ts_rank,
          similarity(unaccent(e.data::text), unaccent(${rawQuery})) AS trgm_rank,
          (
            ts_rank(
              to_tsvector('simple', unaccent(e.data::text)),
              to_tsquery('simple', unaccent(${queryParam}))
            ) * 2 + similarity(unaccent(e.data::text), unaccent(${rawQuery}))
          ) AS combined_rank
        FROM content.content_entries e
        WHERE ${whereClause}
          AND (
            to_tsvector('simple', unaccent(e.data::text)) @@ to_tsquery('simple', unaccent(${queryParam}))
            OR similarity(unaccent(e.data::text), unaccent(${rawQuery})) > 0.1
          )
        ORDER BY combined_rank DESC
        LIMIT ${limitParam} OFFSET ${offsetParam}
      `;

      const countSql = `
        SELECT COUNT(*)::int AS total
        FROM content.content_entries e
        WHERE ${whereClause}
          AND (
            to_tsvector('simple', unaccent(e.data::text)) @@ to_tsquery('simple', unaccent(${queryParam}))
            OR similarity(unaccent(e.data::text), unaccent(${rawQuery})) > 0.1
          )
      `;

      const [results, countResult] = await Promise.all([
        this.prisma.client.$queryRawUnsafe(sql, ...values),
        this.prisma.client.$queryRawUnsafe(countSql, ...values.slice(0, -2)), // without limit/offset
      ]);

      const total = (countResult as any[])[0]?.total ?? 0;

      return {
        data: results as (IContentEntry & { rank?: number })[],
        meta: {
          total,
          page,
          pageSize,
          totalPages: Math.ceil(total / pageSize),
        },
      };
    } catch (err) {
      this.logger.error(`Search failed: ${err}`);
      // Fallback to simple ILIKE if pg_trgm/unaccent not available
      return this.fallbackSearch(params, page, pageSize);
    }
  }

  /** Simple ILIKE fallback when extensions are not available */
  private async fallbackSearch(params: {
    query: string;
    contentTypeId?: string;
    locale?: string;
    status?: string;
    tenantId?: string;
  }, page: number, pageSize: number): Promise<ContentPaginatedResult<IContentEntry>> {
    const where: Record<string, unknown> = {};
    if (params.tenantId) where.tenantId = params.tenantId;
    if (params.contentTypeId) where.contentTypeId = params.contentTypeId;
    if (params.locale) where.locale = params.locale;
    if (params.status) where.status = params.status;

    // Use Prisma's JSON string_contains as fallback
    const [data, total] = await Promise.all([
      this.prisma.client.contentEntry.findMany({
        where: {
          ...where,
          data: { string_contains: params.query },
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.client.contentEntry.count({
        where: {
          ...where,
          data: { string_contains: params.query },
        },
      }),
    ]);

    return {
      data,
      meta: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
    };
  }
}
