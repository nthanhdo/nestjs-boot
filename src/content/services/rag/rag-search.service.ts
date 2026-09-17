import { Injectable, Inject, Logger } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { CONTENT_MODULE_OPTIONS, RAG_EMBEDDING_PROVIDER } from '../../constants';
import type { ContentModuleOptions } from '../../interfaces/content-options.interface';
import type { EmbeddingProvider } from '../../interfaces/embedding-provider.interface';
import type { IContentEntry, ContentPaginatedResult } from '../../interfaces';

export interface RagSearchResult extends IContentEntry {
  score?: number;
}

@Injectable()
export class RagSearchService {
  private readonly logger = new Logger(RagSearchService.name);
  private readonly threshold: number;
  private readonly vectorWeight: number;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(RAG_EMBEDDING_PROVIDER) private readonly embeddingProvider: EmbeddingProvider,
    @Inject(CONTENT_MODULE_OPTIONS) private readonly options: ContentModuleOptions,
  ) {
    this.threshold = options.rag?.similarityThreshold ?? 0.7;
    this.vectorWeight = options.rag?.vectorWeight ?? 0.7;
  }

  /**
   * Pure semantic search — vector similarity only.
   */
  async semanticSearch(params: {
    query: string;
    locale?: string;
    contentTypeId?: string;
    tenantId?: string;
    page?: number;
    pageSize?: number;
  }): Promise<ContentPaginatedResult<RagSearchResult>> {
    const page = params.page ?? 1;
    const pageSize = params.pageSize ?? this.options.defaultPageSize ?? 25;
    const offset = (page - 1) * pageSize;

    // Embed the query
    const [queryEmbedding] = await this.embeddingProvider.embed([params.query]);
    const vectorStr = `[${queryEmbedding.join(',')}]`;

    // Build conditions
    const conditions: string[] = ["e.status = 'PUBLISHED'"];
    const values: unknown[] = [];
    let idx = 1;

    values.push(vectorStr); // $1 = query vector
    idx++;
    values.push(this.threshold); // $2 = threshold
    idx++;

    if (params.tenantId) {
      conditions.push(`e.tenant_id = $${idx}`);
      values.push(params.tenantId);
      idx++;
    }
    if (params.locale) {
      conditions.push(`e.locale = $${idx}`);
      values.push(params.locale);
      idx++;
    }
    if (params.contentTypeId) {
      conditions.push(`e.content_type_id = $${idx}`);
      values.push(params.contentTypeId);
      idx++;
    }

    values.push(pageSize); // limit
    const limitIdx = idx++;
    values.push(offset); // offset
    const offsetIdx = idx++;

    const where = conditions.join(' AND ');

    const sql = `
      SELECT e.*, MAX(1 - (ce.embedding <=> $1::vector)) AS score
      FROM content.content_entries e
      JOIN content.content_embeddings ce ON ce.entry_id = e.id
      WHERE ${where}
      GROUP BY e.id
      HAVING MAX(1 - (ce.embedding <=> $1::vector)) >= $2
      ORDER BY score DESC
      LIMIT $${limitIdx} OFFSET $${offsetIdx}
    `;

    const countSql = `
      SELECT COUNT(DISTINCT e.id)::int AS total
      FROM content.content_entries e
      JOIN content.content_embeddings ce ON ce.entry_id = e.id
      WHERE ${where}
        AND (1 - (ce.embedding <=> $1::vector)) >= $2
    `;

    try {
      const [results, countResult] = await Promise.all([
        this.prisma.client.$queryRawUnsafe(sql, ...values) as Promise<RagSearchResult[]>,
        this.prisma.client.$queryRawUnsafe(countSql, ...values.slice(0, -2)) as Promise<Array<{ total: number }>>,
      ]);

      const total = countResult[0]?.total ?? 0;
      return {
        data: results,
        meta: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
      };
    } catch (err) {
      this.logger.error(`Semantic search failed: ${err}`);
      return { data: [], meta: { total: 0, page, pageSize, totalPages: 0 } };
    }
  }

  /**
   * Hybrid search — combines vector similarity with keyword (tsvector) ranking.
   * Score = vectorWeight * vector_score + (1 - vectorWeight) * keyword_score
   */
  async hybridSearch(params: {
    query: string;
    locale?: string;
    contentTypeId?: string;
    tenantId?: string;
    page?: number;
    pageSize?: number;
  }): Promise<ContentPaginatedResult<RagSearchResult>> {
    const page = params.page ?? 1;
    const pageSize = params.pageSize ?? this.options.defaultPageSize ?? 25;
    const offset = (page - 1) * pageSize;

    // Embed the query
    const [queryEmbedding] = await this.embeddingProvider.embed([params.query]);
    const vectorStr = `[${queryEmbedding.join(',')}]`;

    // Build tsquery tokens for keyword search
    const sanitized = params.query.replace(/[^\w\s\u00C0-\u024F]/g, '').trim();
    const tokens = sanitized.split(/\s+/).filter(Boolean).map((t) => `${t}:*`).join(' & ');

    const conditions: string[] = ["e.status = 'PUBLISHED'"];
    const values: unknown[] = [];
    let idx = 1;

    values.push(vectorStr); // $1 = query vector
    idx++;
    values.push(tokens); // $2 = tsquery tokens
    idx++;
    values.push(sanitized); // $3 = raw query for trigram
    idx++;
    values.push(this.vectorWeight); // $4 = vector weight
    idx++;

    if (params.tenantId) {
      conditions.push(`e.tenant_id = $${idx}`);
      values.push(params.tenantId);
      idx++;
    }
    if (params.locale) {
      conditions.push(`e.locale = $${idx}`);
      values.push(params.locale);
      idx++;
    }
    if (params.contentTypeId) {
      conditions.push(`e.content_type_id = $${idx}`);
      values.push(params.contentTypeId);
      idx++;
    }

    values.push(pageSize);
    const limitIdx = idx++;
    values.push(offset);
    const offsetIdx = idx++;

    const where = conditions.join(' AND ');

    const sql = `
      WITH semantic AS (
        SELECT ce.entry_id, MAX(1 - (ce.embedding <=> $1::vector)) AS vector_score
        FROM content.content_embeddings ce
        GROUP BY ce.entry_id
        HAVING MAX(1 - (ce.embedding <=> $1::vector)) >= ${this.threshold}
      ),
      keyword AS (
        SELECT e.id AS entry_id,
          ts_rank(
            to_tsvector('simple', unaccent(e.data::text)),
            to_tsquery('simple', unaccent($2))
          ) AS keyword_score
        FROM content.content_entries e
        WHERE ${where}
          AND to_tsvector('simple', unaccent(e.data::text)) @@ to_tsquery('simple', unaccent($2))
      )
      SELECT e.*,
        (COALESCE(s.vector_score, 0) * $4 + COALESCE(k.keyword_score, 0) * (1 - $4)) AS score
      FROM content.content_entries e
      LEFT JOIN semantic s ON s.entry_id = e.id
      LEFT JOIN keyword k ON k.entry_id = e.id
      WHERE ${where}
        AND (s.entry_id IS NOT NULL OR k.entry_id IS NOT NULL)
      ORDER BY score DESC
      LIMIT $${limitIdx} OFFSET $${offsetIdx}
    `;

    try {
      const results = await this.prisma.client.$queryRawUnsafe(sql, ...values) as RagSearchResult[];

      // Count total (simplified — without vector ops for perf)
      const total = results.length < pageSize && page === 1 ? results.length : results.length + offset + 1;

      return {
        data: results,
        meta: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
      };
    } catch (err) {
      this.logger.error(`Hybrid search failed: ${err}`);
      return { data: [], meta: { total: 0, page, pageSize, totalPages: 0 } };
    }
  }
}
