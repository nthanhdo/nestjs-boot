/**
 * Abstract embedding provider interface.
 * Implement this to integrate a custom embedding model.
 */
export interface EmbeddingProvider {
  /**
   * Generate embeddings for one or more text inputs.
   * @param texts - Array of text strings to embed
   * @returns Array of embedding vectors (number arrays), one per input text
   */
  embed(texts: string[]): Promise<number[][]>;

  /**
   * Embedding dimension for this provider/model.
   */
  readonly dimension: number;
}
