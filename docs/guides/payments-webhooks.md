# Payments & Webhooks

`WebhookModule` handles payment webhook verification, event normalization, and idempotent request processing for Stripe, PayPal, and custom providers.

## Setup

```ts
import { WebhookModule } from 'nestjs-boot/payments';

@Module({
  imports: [
    WebhookModule.register({
      providers: {
        stripe: { secret: process.env.STRIPE_WEBHOOK_SECRET },
        paypal: { secret: process.env.PAYPAL_WEBHOOK_SECRET },
      },
      handler: async (event) => {
        if (event.type === 'payment_intent.succeeded') {
          await ordersService.fulfill(event.data);
        }
      },
    }),
  ],
})
export class AppModule {}
```

NestJS must be configured with `rawBody: true` so the raw Buffer is available for signature verification:

```ts
const app = await NestFactory.create(AppModule, { rawBody: true });
```

## Webhook Endpoints

The module registers a dynamic `POST /webhooks/:provider` endpoint. Requests are routed by provider name:

- `POST /webhooks/stripe` — Stripe events
- `POST /webhooks/paypal` — PayPal events
- `POST /webhooks/{custom}` — any custom provider

## Signature Verification

### Stripe

Stripe sends a `stripe-signature` header with format `t=<timestamp>,v1=<hmac>`. The built-in `StripeWebhookProvider` recomputes HMAC-SHA256 over `${timestamp}.${rawBody}` and compares using timing-safe equality.

### PayPal

PayPal uses certificate-based RSA verification in production. The built-in provider includes a simplified HMAC fallback and logs a warning. For production, supply a custom `verifyFn`:

```ts
paypal: {
  secret: process.env.PAYPAL_WEBHOOK_SECRET,
  verifyFn: (payload, signature, secret) => {
    // Use @paypal/paypal-server-sdk or PayPal REST API
    return verifyPayPalSignature(payload, signature, secret);
  },
},
```

## Custom Providers

Implement `WebhookProvider` to add any payment processor:

```ts
import { WebhookProvider, WebhookEvent } from 'nestjs-boot/payments';

export class LemonSqueezyProvider implements WebhookProvider {
  name = 'lemonsqueezy';

  verifySignature(payload: Buffer, signature: string, secret: string): boolean {
    const hmac = createHmac('sha256', secret).update(payload).digest('hex');
    return timingSafeEqual(Buffer.from(hmac), Buffer.from(signature));
  }

  normalizeEvent(rawPayload: unknown): WebhookEvent {
    const raw = rawPayload as Record<string, unknown>;
    return {
      provider: 'custom',
      type: raw['event_name'] as string,
      id: raw['meta']?.['event_id'] as string,
      data: raw['data'] as Record<string, unknown>,
      timestamp: new Date(),
      raw,
    };
  }
}
```

Register it:

```ts
WebhookModule.register({
  providers: { lemonsqueezy: { secret: process.env.LS_WEBHOOK_SECRET } },
  customProviders: [new LemonSqueezyProvider()],
  handler: async (event) => { /* ... */ },
});
```

## Event Normalization

All providers normalize events to a unified `WebhookEvent` shape:

```ts
interface WebhookEvent {
  provider: 'stripe' | 'paypal' | 'custom';
  type: string;       // e.g. 'payment_intent.succeeded'
  id: string;         // provider event ID (used for dedup)
  data: Record<string, unknown>;
  timestamp: Date;
  raw: unknown;       // original payload
}
```

## Webhook Deduplication

The controller maintains an in-memory dedup store keyed by `event.id`. Duplicate events within a 5-minute TTL window are silently skipped. The store is bounded at 10,000 entries with TTL-based eviction followed by oldest-first trimming.

## @Idempotent Decorator

For your own endpoints (not just webhooks), use `@Idempotent` to cache responses by `Idempotency-Key` header:

```ts
@Post('charge')
@Idempotent(3600) // cache for 1 hour
async charge(@Body() dto: ChargeDto) {
  return this.paymentsService.charge(dto);
}
```

How it works:
1. Client sends `Idempotency-Key: <uuid>` header with a POST/PUT/PATCH request.
2. `IdempotencyGuard` checks the in-memory cache for that key.
3. Cache hit (within TTL) — returns the cached `{ statusCode, body }` immediately without calling the handler.
4. Cache miss — handler executes, response is cached for future requests with the same key.

The guard only activates on mutating methods (POST, PUT, PATCH). GET/DELETE requests pass through. Missing `Idempotency-Key` header also passes through (advisory, not blocking).

## IdempotencyGuard Internals

- **MAX_SIZE:** 10,000 entries. Eviction runs before each new insert.
- **Eviction order:** expired entries first (by TTL), then oldest by insertion order.
- **Default TTL:** 86,400 seconds (24 hours) when no TTL argument is passed to `@Idempotent()`.

## Best Practices

- Always enable `rawBody: true` in NestFactory — signature verification requires the unmodified request body.
- Use the `verifyFn` option for PayPal in production; the built-in HMAC fallback is for development only.
- Set idempotency TTL to match your provider's retry window (Stripe retries for up to 72 hours).
- Return errors from the handler to allow retries — the dedup entry is removed on handler failure.
- For high-throughput systems, replace the in-memory dedup store with Redis.
