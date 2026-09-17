import { Injectable, Inject } from '@nestjs/common';
import { CONTENT_MODULE_OPTIONS } from '../../constants';
import type { ContentModuleOptions } from '../../interfaces/content-options.interface';

export interface TextChunk {
  index: number;
  text: string;
  metadata?: Record<string, unknown>;
}

/**
 * Extracts text from JSONB entry data and splits into chunks for embedding.
 */
@Injectable()
export class ChunkingService {
  private readonly chunkSize: number;
  private readonly chunkOverlap: number;

  constructor(@Inject(CONTENT_MODULE_OPTIONS) options: ContentModuleOptions) {
    this.chunkSize = options.rag?.chunkSize ?? 4000;
    this.chunkOverlap = options.rag?.chunkOverlap ?? 200;
  }

  /**
   * Extract all text content from a JSONB data object.
   * Recursively walks the object, concatenating all string values.
   */
  extractText(data: Record<string, unknown>): string {
    const parts: string[] = [];
    this.walkObject(data, parts);
    return parts.join('\n\n').trim();
  }

  /**
   * Split text into chunks with overlap.
   * Uses recursive splitting: paragraphs → sentences → words.
   */
  chunk(text: string, metadata?: Record<string, unknown>): TextChunk[] {
    if (!text || text.length === 0) return [];

    // If text fits in a single chunk, return as-is
    if (text.length <= this.chunkSize) {
      return [{ index: 0, text, metadata }];
    }

    const chunks: TextChunk[] = [];
    const rawChunks = this.recursiveSplit(text);

    for (let i = 0; i < rawChunks.length; i++) {
      chunks.push({
        index: i,
        text: rawChunks[i],
        metadata: { ...metadata, chunkIndex: i, totalChunks: rawChunks.length },
      });
    }

    return chunks;
  }

  /**
   * Extract and chunk in one call.
   */
  extractAndChunk(data: Record<string, unknown>, metadata?: Record<string, unknown>): TextChunk[] {
    const text = this.extractText(data);
    return this.chunk(text, metadata);
  }

  private recursiveSplit(text: string): string[] {
    const separators = ['\n\n', '\n', '. ', ' '];
    return this.splitBySeparators(text, separators);
  }

  private splitBySeparators(text: string, separators: string[]): string[] {
    if (text.length <= this.chunkSize) return [text];
    if (separators.length === 0) {
      // Hard split at chunkSize as last resort
      return this.hardSplit(text);
    }

    const [sep, ...remaining] = separators;
    const parts = text.split(sep);
    const chunks: string[] = [];
    let current = '';

    for (const part of parts) {
      const candidate = current ? current + sep + part : part;

      if (candidate.length <= this.chunkSize) {
        current = candidate;
      } else {
        if (current) chunks.push(current);

        if (part.length > this.chunkSize) {
          // Recursively split the oversized part with next separator
          chunks.push(...this.splitBySeparators(part, remaining));
          current = '';
        } else {
          current = part;
        }
      }
    }

    if (current) chunks.push(current);

    // Add overlap between chunks
    return this.addOverlap(chunks);
  }

  private hardSplit(text: string): string[] {
    const chunks: string[] = [];
    for (let i = 0; i < text.length; i += this.chunkSize - this.chunkOverlap) {
      chunks.push(text.slice(i, i + this.chunkSize));
      if (i + this.chunkSize >= text.length) break;
    }
    return chunks;
  }

  private addOverlap(chunks: string[]): string[] {
    if (chunks.length <= 1 || this.chunkOverlap <= 0) return chunks;

    const result: string[] = [chunks[0]];
    for (let i = 1; i < chunks.length; i++) {
      const prevEnd = chunks[i - 1].slice(-this.chunkOverlap);
      result.push(prevEnd + chunks[i]);
    }
    return result;
  }

  private walkObject(obj: unknown, parts: string[]): void {
    if (obj === null || obj === undefined) return;

    if (typeof obj === 'string') {
      const cleaned = this.stripHtml(obj).trim();
      if (cleaned) parts.push(cleaned);
      return;
    }

    if (Array.isArray(obj)) {
      for (const item of obj) this.walkObject(item, parts);
      return;
    }

    if (typeof obj === 'object') {
      for (const [key, value] of Object.entries(obj)) {
        // Skip metadata fields
        if (['id', 'slug', 'createdAt', 'updatedAt', 'publishedAt', 'scheduledAt'].includes(key)) continue;
        this.walkObject(value, parts);
      }
    }
  }

  private stripHtml(html: string): string {
    return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
  }
}
