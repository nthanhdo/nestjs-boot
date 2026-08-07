import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHmac } from 'crypto';
import { StripeWebhookProvider, PayPalWebhookProvider } from '../../src/payments/webhook.providers';
import { IdempotencyGuard } from '../../src/payments/idempotency.guard';
import { WebhookEvent } from '../../src/payments/webhook.interfaces';

// ─── 1. Stripe signature verification ────────────────────────────────────────
describe('StripeWebhookProvider', () => {
  const provider = new StripeWebhookProvider();
  const secret = 'whsec_test_secret_key';

  function buildStripeSignature(payload: string, secret: string, timestamp = Math.floor(Date.now() / 1000)): string {
    const signedPayload = `${timestamp}.${payload}`;
    const sig = createHmac('sha256', secret).update(signedPayload).digest('hex');
    return `t=${timestamp},v1=${sig}`;
  }

  it('should verify a valid Stripe HMAC-SHA256 signature', () => {
    const payload = JSON.stringify({ id: 'evt_123', type: 'payment_intent.succeeded', data: {}, created: 1700000000 });
    const signature = buildStripeSignature(payload, secret);
    expect(provider.verifySignature(Buffer.from(payload), signature, secret)).toBe(true);
  });

  it('should reject a tampered Stripe signature', () => {
    const payload = JSON.stringify({ id: 'evt_456', type: 'payment_intent.succeeded', data: {} });
    const signature = buildStripeSignature(payload, secret);
    const tamperedSignature = signature.replace(/v1=\w+/, 'v1=deadbeefdeadbeefdeadbeefdeadbeef00000000000000000000000000000000');
    expect(provider.verifySignature(Buffer.from(payload), tamperedSignature, secret)).toBe(false);
  });

  it('should normalize a Stripe event payload to WebhookEvent', () => {
    const rawPayload = {
      id: 'evt_789',
      type: 'payment_intent.succeeded',
      created: 1700000000,
      data: { object: { amount: 5000, currency: 'usd' } },
    };
    const event = provider.normalizeEvent(rawPayload);
    expect(event.provider).toBe('stripe');
    expect(event.id).toBe('evt_789');
    expect(event.type).toBe('payment_intent.succeeded');
    expect(event.data).toEqual(rawPayload.data);
    expect(event.timestamp).toEqual(new Date(1700000000 * 1000));
    expect(event.raw).toBe(rawPayload);
  });
});

// ─── 2. Idempotency — skip duplicate events ───────────────────────────────────
describe('WebhookController idempotency (store-based)', () => {
  it('should skip processing a duplicate event ID', async () => {
    const store = new Map<string, boolean>();
    const handler = vi.fn().mockResolvedValue(undefined);

    async function dispatchIfNew(event: WebhookEvent) {
      if (store.has(event.id)) return 'skipped';
      store.set(event.id, true);
      await handler(event);
      return 'processed';
    }

    const event: WebhookEvent = {
      provider: 'stripe',
      type: 'payment_intent.succeeded',
      id: 'evt_idempotent_001',
      data: {},
      timestamp: new Date(),
      raw: {},
    };

    expect(await dispatchIfNew(event)).toBe('processed');
    expect(await dispatchIfNew(event)).toBe('skipped');
    expect(handler).toHaveBeenCalledTimes(1);
  });
});

// ─── 3. Custom provider — normalizes event ────────────────────────────────────
describe('Custom WebhookProvider', () => {
  it('should allow a custom provider to normalize events', () => {
    const customProvider = {
      name: 'custom',
      verifySignature: (_payload: Buffer, sig: string, secret: string) => sig === secret,
      normalizeEvent: (raw: unknown): WebhookEvent => ({
        provider: 'custom',
        type: (raw as Record<string, string>)['eventType'],
        id: (raw as Record<string, string>)['eventId'],
        data: raw as Record<string, unknown>,
        timestamp: new Date(),
        raw,
      }),
    };

    const valid = customProvider.verifySignature(Buffer.from('body'), 'mysecret', 'mysecret');
    expect(valid).toBe(true);

    const event = customProvider.normalizeEvent({ eventType: 'order.created', eventId: 'custom_001' });
    expect(event.provider).toBe('custom');
    expect(event.type).toBe('order.created');
    expect(event.id).toBe('custom_001');
  });
});

// ─── 4. Missing signature → should reject ─────────────────────────────────────
describe('StripeWebhookProvider — missing signature', () => {
  const provider = new StripeWebhookProvider();

  it('should return false for an empty signature string', () => {
    const payload = Buffer.from('{}');
    expect(provider.verifySignature(payload, '', 'secret')).toBe(false);
  });

  it('should return false for a malformed signature (no t= or v1=)', () => {
    const payload = Buffer.from('{}');
    expect(provider.verifySignature(payload, 'not-a-valid-sig', 'secret')).toBe(false);
  });
});
