import { Injectable } from '@nestjs/common';
import { RagEmbeddingService } from './rag-embedding.service';

@Injectable()
export class RagManagementService {
  constructor(private readonly embeddingService: RagEmbeddingService) {}

  async reEmbed(contentTypeId?: string, tenantId?: string): Promise<{ total: number; embedded: number }> {
    return this.embeddingService.embedAll(contentTypeId, tenantId);
  }

  async getStatus(tenantId?: string): Promise<{ totalEntries: number; embeddedEntries: number; totalChunks: number }> {
    return this.embeddingService.getStats(tenantId);
  }
}
