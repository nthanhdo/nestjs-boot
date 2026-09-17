import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ContentWebhookService } from '../../src/content/services/content-webhook.service';

describe('ContentWebhookService', () => {
  let service: ContentWebhookService;
  let mockWebhookRepo: any;

  beforeEach(() => {
    mockWebhookRepo = {
      findByEvent: vi.fn(),
      createLog: vi.fn(),
    };
  });

  it('should not dispatch when webhooks disabled', async () => {
    service = new ContentWebhookService(mockWebhookRepo, { enableWebhooks: false } as any);

    await service.dispatch({
      type: 'entry.created',
      payload: { id: '1' },
      timestamp: new Date(),
    });

    expect(mockWebhookRepo.findByEvent).not.toHaveBeenCalled();
  });

  it('should skip when no matching webhooks', async () => {
    service = new ContentWebhookService(mockWebhookRepo, { enableWebhooks: true, webhookRetryAttempts: 1 } as any);
    mockWebhookRepo.findByEvent.mockResolvedValue([]);

    await service.dispatch({
      type: 'entry.created',
      payload: { id: '1' },
      timestamp: new Date(),
    });

    expect(mockWebhookRepo.findByEvent).toHaveBeenCalledWith('entry.created', undefined);
    expect(mockWebhookRepo.createLog).not.toHaveBeenCalled();
  });

  describe('verifySignature', () => {
    it('should verify valid HMAC signature', () => {
      const payload = '{"test":true}';
      const secret = 'my-secret';

      const { createHmac } = require('crypto');
      const expected = createHmac('sha256', secret).update(payload).digest('hex');

      expect(ContentWebhookService.verifySignature(payload, `sha256=${expected}`, secret)).toBe(true);
    });

    it('should reject invalid signature', () => {
      expect(ContentWebhookService.verifySignature('payload', 'sha256=wrong', 'secret')).toBe(false);
    });
  });
});
