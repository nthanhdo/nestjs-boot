import type { EmbeddingProvider } from './embedding-provider.interface';

export interface RagOptions {
  /** Enable RAG semantic search. @default false */
  enabled: boolean;

  /** Embedding provider. @default 'openai' */
  embeddingProvider: 'openai' | 'custom';

  /** API key for the embedding provider (e.g., OpenAI API key). Read from RAG_API_KEY env. */
  apiKey?: string;

  /** Embedding model name. @default 'text-embedding-3-small' */
  model?: string;

  /** Embedding vector dimension. @default 1536 */
  dimension?: number;

  /** Minimum cosine similarity score to include in results. @default 0.7 */
  similarityThreshold?: number;

  /** Maximum characters per chunk. @default 4000 (~1000 tokens) */
  chunkSize?: number;

  /** Overlap characters between chunks. @default 200 */
  chunkOverlap?: number;

  /** Weight for vector score in hybrid search (0-1). Keyword weight = 1 - this. @default 0.7 */
  vectorWeight?: number;

  /** Custom embedding provider instance (when embeddingProvider='custom'). */
  customProvider?: EmbeddingProvider;
}
