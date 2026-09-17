import { Injectable, Inject, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { ChunkingService } from './chunking.service';
import { CONTENT_MODULE_OPTIONS, RAG_EMBEDDING_PROVIDER } from '../../constants';
import type { ContentModuleOptions } from '../../interfaces/content-options.interface';
import type { EmbeddingProvider } from '../../interfaces/embedding-provider.interface';

@Injectable()
export class RagEmbeddingService {
  private readonly logger = new Logger(RagEmbeddingService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly chunkingService: ChunkingService,
    @Inject(RAG_EMBEDDING_PROVIDER) private readonly embeddingProvider: EmbeddingProvider,
    @Inject(CONTENT_MODULE_OPTIONS) _options: ContentModuleOptions,
  ) {}

  /**
   * Generate and store embeddings for a single entry.
   * Deletes existing embeddings first (safe for re-embed).
   */
  async embedEntry(entryId: string, tenantId?: string): Promise<number> {
    const entry = await this.prisma.client.contentEntry.findFirst({
      where: { id: entryId },
    });
    if (!entry) {
      this.logger.warn(`Entry ${entryId} not found, skipping embedding`);
      return 0;
    }

    // Delete existing embeddings
    await this.prisma.client.$executeRawUnsafe(
      'DELETE FROM content.content_embeddings WHERE entry_id = $1',
      entryId,
    );

    // Extract and chunk text from entry data
    const data = entry.data as Record<string, unknown>;
    const chunks = this.chunkingService.extractAndChunk(data, {
      entryId,
      slug: entry.slug,
      locale: entry.locale,
    });

    if (chunks.length === 0) {
      this.logger.debug(`Entry ${entryId}: no text to embed`);
      return 0;
    }

    // Generate embeddings in batch
    const texts = chunks.map((c) => c.text);
    const embeddings = await this.embeddingProvider.embed(texts);

    // Insert chunks + embeddings via raw SQL (Prisma can't handle vector type)
    for (let i = 0; i < chunks.length; i++) {
      const id = randomUUID();
      await this.prisma.client.$executeRawUnsafe(
        `INSERT INTO content.content_embeddings (id, entry_id, chunk_index, chunk_text, embedding, metadata, tenant_id, created_at)
         VALUES ($1, $2, $3, $4, $5::vector, $6::jsonb, $7, NOW())`,
        id,
        entryId,
        chunks[i].index,
        chunks[i].text,
        `[${embeddings[i].join(',')}]`,
        JSON.stringify(chunks[i].metadata ?? {}),
        tenantId ?? null,
      );
    }

    this.logger.log(`Entry ${entryId}: embedded ${chunks.length} chunks`);
    return chunks.length;
  }

  /**
   * Re-embed all published entries. Optionally filter by content type.
   */
  async embedAll(contentTypeId?: string, tenantId?: string): Promise<{ total: number; embedded: number }> {
    const where: Record<string, unknown> = { status: 'PUBLISHED' };
    if (contentTypeId) where.contentTypeId = contentTypeId;
    if (tenantId) where.tenantId = tenantId;

    const entries = await this.prisma.client.contentEntry.findMany({ where });
    let embedded = 0;

    for (const entry of entries) {
      try {
        const chunks = await this.embedEntry(entry.id, tenantId);
        if (chunks > 0) embedded++;
      } catch (err) {
        this.logger.error(`Failed to embed entry ${entry.id}: ${err}`);
      }
    }

    return { total: entries.length, embedded };
  }

  /**
   * Get embedding stats for a tenant.
   */
  async getStats(tenantId?: string): Promise<{ totalEntries: number; embeddedEntries: number; totalChunks: number }> {
    const where: Record<string, unknown> = { status: 'PUBLISHED' };
    if (tenantId) where.tenantId = tenantId;

    const totalEntries = await this.prisma.client.contentEntry.count({ where });

    const embeddedResult = await this.prisma.client.$queryRawUnsafe(
      `SELECT COUNT(DISTINCT entry_id)::int AS count FROM content.content_embeddings${tenantId ? ' WHERE tenant_id = $1' : ''}`,
      ...(tenantId ? [tenantId] : []),
    ) as Array<{ count: number }>;

    const chunkResult = await this.prisma.client.$queryRawUnsafe(
      `SELECT COUNT(*)::int AS count FROM content.content_embeddings${tenantId ? ' WHERE tenant_id = $1' : ''}`,
      ...(tenantId ? [tenantId] : []),
    ) as Array<{ count: number }>;

    return {
      totalEntries,
      embeddedEntries: embeddedResult[0]?.count ?? 0,
      totalChunks: chunkResult[0]?.count ?? 0,
    };
  }
}
