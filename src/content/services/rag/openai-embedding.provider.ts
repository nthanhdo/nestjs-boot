import { Logger } from '@nestjs/common';
import type { EmbeddingProvider } from '../../interfaces/embedding-provider.interface';

/**
 * OpenAI embedding provider using native fetch (no SDK dependency).
 * Supports text-embedding-3-small (1536 dims) and text-embedding-3-large (3072 dims).
 */
export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  private readonly logger = new Logger(OpenAIEmbeddingProvider.name);
  readonly dimension: number;

  constructor(
    private readonly apiKey: string,
    private readonly model: string = 'text-embedding-3-small',
    dimension?: number,
  ) {
    this.dimension = dimension ?? (model.includes('large') ? 3072 : 1536);
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        input: texts,
        model: this.model,
        dimensions: this.dimension,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      this.logger.error(`OpenAI embedding API error (${response.status}): ${error}`);
      throw new Error(`OpenAI embedding failed: ${response.status} ${error}`);
    }

    const result = await response.json() as {
      data: Array<{ embedding: number[]; index: number }>;
    };

    // Sort by index to maintain order
    return result.data
      .sort((a, b) => a.index - b.index)
      .map((d) => d.embedding);
  }
}
