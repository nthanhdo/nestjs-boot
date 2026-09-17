import type { EmbeddingProvider } from '../../interfaces/embedding-provider.interface';
import type { RagOptions } from '../../interfaces/rag-options.interface';
import { OpenAIEmbeddingProvider } from './openai-embedding.provider';

/**
 * Factory to create the appropriate EmbeddingProvider based on config.
 */
export function createEmbeddingProvider(options: RagOptions): EmbeddingProvider {
  switch (options.embeddingProvider) {
    case 'openai': {
      if (!options.apiKey) {
        throw new Error('RAG: apiKey (RAG_API_KEY) is required for OpenAI embedding provider');
      }
      return new OpenAIEmbeddingProvider(
        options.apiKey,
        options.model ?? 'text-embedding-3-small',
        options.dimension,
      );
    }

    case 'custom': {
      if (!options.customProvider) {
        throw new Error('RAG: customProvider is required when embeddingProvider is "custom"');
      }
      return options.customProvider;
    }

    default:
      throw new Error(`RAG: unknown embeddingProvider "${options.embeddingProvider}"`);
  }
}
