import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CdnPurgeService } from '../../src/content/services/cdn/cdn-purge.service';

describe('CdnPurgeService', () => {
  describe('cloudflare provider', () => {
    let service: CdnPurgeService;

    beforeEach(() => {
      service = new CdnPurgeService({
        deliveryPrefix: '/api/delivery',
        cdn: {
          enabled: true,
          provider: 'cloudflare',
          cloudflareZoneId: 'zone-123',
          cloudflareApiToken: 'token-abc',
          purgeOnPublish: true,
        },
      } as any);
    });

    it('should initialize with cloudflare provider', () => {
      expect(service).toBeDefined();
    });

    it('should construct purge paths for entry', async () => {
      // Mock fetch globally
      const mockFetch = vi.fn().mockResolvedValue({ ok: true });
      globalThis.fetch = mockFetch;

      await service.purgeEntry('my-post', 'en');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('zone-123/purge_cache'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer token-abc',
          }),
        }),
      );
    });

    it('should skip purge when purgeOnPublish is false', async () => {
      const service2 = new CdnPurgeService({
        deliveryPrefix: '/api/delivery',
        cdn: {
          enabled: true,
          provider: 'cloudflare',
          cloudflareZoneId: 'zone-123',
          cloudflareApiToken: 'token-abc',
          purgeOnPublish: false,
        },
      } as any);

      const mockFetch = vi.fn();
      globalThis.fetch = mockFetch;

      await service2.purgeEntry('slug');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should purge asset by ID', async () => {
      const mockFetch = vi.fn().mockResolvedValue({ ok: true });
      globalThis.fetch = mockFetch;

      await service.purgeAsset('asset-123');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('purge_cache'),
        expect.objectContaining({
          body: expect.stringContaining('asset-123'),
        }),
      );
    });

    it('should handle purge errors gracefully', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, text: () => Promise.resolve('error') });

      // Should not throw — logs error internally
      await service.purgeEntry('slug');
    });
  });

  describe('custom provider', () => {
    it('should POST to custom purge URL', async () => {
      const mockFetch = vi.fn().mockResolvedValue({ ok: true });
      globalThis.fetch = mockFetch;

      const service = new CdnPurgeService({
        deliveryPrefix: '/api/delivery',
        cdn: {
          enabled: true,
          provider: 'custom',
          customPurgeUrl: 'https://my-cdn.example.com/purge',
          customPurgeHeaders: { 'X-Custom': 'value' },
          purgeOnPublish: true,
        },
      } as any);

      await service.purgeEntry('test-slug');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://my-cdn.example.com/purge',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({ 'X-Custom': 'value' }),
        }),
      );
    });
  });

  describe('unknown provider', () => {
    it('should throw on unknown provider', () => {
      expect(() => new CdnPurgeService({
        cdn: { enabled: true, provider: 'unknown' as any },
      } as any)).toThrow('unknown provider');
    });
  });
});
