import { describe, it, expect, vi } from 'vitest';
import { WebhookController } from '../../src/payments/webhook.controller';
import { WebhookModuleOptions, WebhookProvider } from '../../src/payments/webhook.interfaces';

// Custom provider for testing dynamic routing
class SquareWebhookProvider implements WebhookProvider {
  name = 'square';
  verifySignature(payload: Buffer, signature: string, secret: string): boolean {
    return signature === 'valid-square-sig';
  }
  normalizeEvent(rawPayload: unknown) {
    const raw = rawPayload as Record<string, unknown>;
    return {
      provider: 'custom' as const,
      type: (raw['type'] as string) ?? 'unknown',
      id: (raw['id'] as string) ?? `square_${Date.now()}`,
      data: raw,
      timestamp: new Date(),
      raw,
    };
  }
}

describe('WebhookController — dynamic provider routing', () => {
  it('should route to a custom provider registered via customProviders', async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    const options: WebhookModuleOptions = {
      providers: {
        square: { secret: 'sq-secret' },
      } as any,
      handler,
      customProviders: [new SquareWebhookProvider()],
    };

    const controller = new WebhookController(options, new Map());

    const payload = JSON.stringify({ id: 'sq_evt_1', type: 'payment.completed' });
    const req = { rawBody: Buffer.from(payload) } as any;
    const headers = { 'x-webhook-signature': 'valid-square-sig' };

    const result = await controller.handleWebhook('square', req, headers);
    expect(result).toEqual({ received: true });
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'sq_evt_1', type: 'payment.completed' }),
    );
  });

  it('should reject unknown provider names with 401', async () => {
    const options: WebhookModuleOptions = {
      providers: {},
      handler: vi.fn(),
    };

    const controller = new WebhookController(options, new Map());
    const req = { rawBody: Buffer.from('{}') } as any;

    await expect(
      controller.handleWebhook('unknown', req, {}),
    ).rejects.toThrow('Unknown webhook provider: unknown');
  });
});
