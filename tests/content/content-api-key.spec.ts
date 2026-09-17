import { describe, it, expect } from 'vitest';
import { ContentApiKeyRepository } from '../../src/content/repositories/content-api-key.repository';

describe('ContentApiKeyRepository.hashKey', () => {
  it('should produce consistent SHA-256 hash', () => {
    const hash1 = ContentApiKeyRepository.hashKey('test-key-123');
    const hash2 = ContentApiKeyRepository.hashKey('test-key-123');
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64); // SHA-256 hex length
  });

  it('should produce different hashes for different keys', () => {
    const hash1 = ContentApiKeyRepository.hashKey('key-a');
    const hash2 = ContentApiKeyRepository.hashKey('key-b');
    expect(hash1).not.toBe(hash2);
  });
});
