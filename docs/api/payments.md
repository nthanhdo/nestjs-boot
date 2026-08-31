# Payments API Reference

> Payment webhook handling with HMAC signature verification and event-ID idempotency deduplication. Supports Stripe and PayPal out of the box; pluggable for custom providers.

## Module Registration

```ts
import { WebhookModule } from 'nestjs-boot';

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
})
```

Via `BootOptions`:

```ts
createApp(AppModule, {
  webhooks: {
    providers: {
      stripe: { secret: process.env.STRIPE_WEBHOOK_SECRET },
    },
    handler: async (event) => { ... },
  },
});
```

> **Required:** NestJS must be initialized with `rawBody: true` so the raw `Buffer` is available for HMAC verification:
>
> ```ts
> const app = await NestFactory.create(AppModule, { rawBody: true });
> ```

## Classes / Methods

### `WebhookController`

Internal controller registered at `POST /webhooks/:provider`. Routes requests to the appropriate `WebhookProvider` by name.

```
POST /webhooks/stripe   → StripeWebhookProvider
POST /webhooks/paypal   → PayPalWebhookProvider
POST /webhooks/:name    → custom WebhookProvider
```

**Request flow per call:**
1. Look up provider by `:provider` param — `401` if unknown.
2. Extract signature header (`stripe-signature` for Stripe, `paypal-transmission-sig` for PayPal, `x-webhook-signature` for custom providers).
3. Call `provider.verifySignature(rawBody, signature, secret)` — `401` on failure.
4. Parse JSON body — `401` on parse error.
5. Call `provider.normalizeEvent(parsed)` to produce a `WebhookEvent`.
6. Idempotency check by `event.id` (in-memory, 5-minute TTL, max 10,000 entries with LRU eviction) — skip duplicate events.
7. Call `options.handler(event)`.

**Returns:** `{ received: true }` with HTTP 200.

---

### `StripeWebhookProvider`

Built-in Stripe webhook provider. Implements HMAC-SHA256 signature verification using Stripe's `t=<timestamp>,v1=<hmac>` format.

```ts
class StripeWebhookProvider implements WebhookProvider {
  name = 'stripe';

  verifySignature(payload: Buffer, signature: string, secret: string): boolean
  normalizeEvent(rawPayload: unknown): WebhookEvent
}
```

**Signature format:** `t=<unix_timestamp>,v1=<hmac_sha256_hex>`

**Signed payload:** `${timestamp}.${rawBody}`

**`normalizeEvent` mapping:**

| `WebhookEvent` field | Stripe payload field |
|---------------------|---------------------|
| `provider` | `'stripe'` |
| `type` | `raw.type` |
| `id` | `raw.id` |
| `data` | `raw.data` |
| `timestamp` | `new Date(raw.created * 1000)` |
| `raw` | full raw payload |

---

### `PayPalWebhookProvider`

Built-in PayPal webhook provider.

```ts
class PayPalWebhookProvider implements WebhookProvider {
  name = 'paypal';

  constructor(config?: PayPalWebhookConfig)
  verifySignature(payload: Buffer, signature: string, secret: string): boolean
  normalizeEvent(rawPayload: unknown): WebhookEvent
}
```

> **Note:** PayPal uses certificate-based RSA verification in production — not HMAC. The built-in `verifySignature` is a simplified HMAC-SHA256 fallback. **Provide a `verifyFn` via `PayPalWebhookConfig` for production deployments** using `@paypal/paypal-server-sdk` or the PayPal `POST /v1/notifications/verify-webhook-signature` REST API.

**`normalizeEvent` mapping:**

| `WebhookEvent` field | PayPal payload field |
|---------------------|---------------------|
| `provider` | `'paypal'` |
| `type` | `raw.event_type` |
| `id` | `raw.id` |
| `data` | `raw.resource` |
| `timestamp` | `new Date(raw.create_time)` |
| `raw` | full raw payload |

---

### `IdempotencyGuard`

NestJS guard that short-circuits duplicate `POST`/`PUT`/`PATCH` requests using the `Idempotency-Key` header.

```ts
@Injectable()
class IdempotencyGuard implements CanActivate
```

**Behavior:**
- If `Idempotency-Key` header is absent or the method is not `POST`/`PUT`/`PATCH`, the request passes through.
- If the key was seen before and the cached response has not expired, the cached response is written directly and the handler is skipped (`canActivate` returns `false`).
- If the key is new, the response is intercepted and cached for the configured TTL.
- Cache is in-memory (`static Map`); max 10,000 entries with expired-first LRU eviction.

**Use via `@Idempotent()` decorator (recommended):**

```ts
@Post('charge')
@Idempotent(3600) // cache for 1 hour
async charge(@Body() dto: ChargeDto) { ... }
```

**Or directly:**

```ts
@UseGuards(IdempotencyGuard)
@Post('charge')
async charge() { ... }
```

## Decorators

### `@Idempotent(ttl?)`

Marks a route as idempotent. Applies `IdempotencyGuard` and sets the TTL metadata.

```ts
function Idempotent(ttl?: number): MethodDecorator
```

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `ttl` | `number` | `86400` | Cache duration in seconds (default: 24 hours) |

**Reads:** `Idempotency-Key` request header.

## Interfaces

### `WebhookModuleOptions`

```ts
interface WebhookModuleOptions {
  providers: {
    stripe?: { secret: string; path?: string };
    paypal?: {
      secret: string;
      path?: string;
      verifyFn?: (payload: Buffer, signature: string, secret: string) => boolean;
    };
  };
  /** Called for every verified, deduplicated event */
  handler: (event: WebhookEvent) => Promise<void>;
  /** Additional custom providers */
  customProviders?: WebhookProvider[];
}
```

### `WebhookEvent`

Normalized, provider-agnostic event object passed to `handler`.

```ts
interface WebhookEvent {
  /** Payment provider that sent this event */
  provider: 'stripe' | 'paypal' | 'custom';
  /** Event type string (e.g. 'payment_intent.succeeded', 'PAYMENT.CAPTURE.COMPLETED') */
  type: string;
  /** Provider-assigned unique event ID — used for idempotency deduplication */
  id: string;
  /** Parsed event data payload */
  data: Record<string, unknown>;
  /** Event timestamp */
  timestamp: Date;
  /** Original raw payload from the provider */
  raw: unknown;
}
```

### `WebhookProvider`

Interface for implementing custom webhook providers.

```ts
interface WebhookProvider {
  name: string;
  /** Return true if signature is valid; false → 401 */
  verifySignature(payload: Buffer, signature: string, secret: string): boolean;
  /** Map provider-specific payload to normalized WebhookEvent */
  normalizeEvent(rawPayload: unknown): WebhookEvent;
}
```

### `PayPalWebhookConfig`

```ts
interface PayPalWebhookConfig {
  /**
   * Custom verification function for RSA certificate-based PayPal verification.
   * When provided, replaces the built-in HMAC fallback.
   */
  verifyFn?: (payload: Buffer, signature: string, secret: string) => boolean;
}
```

## Constants / Tokens

| Export | Value | Description |
|--------|-------|-------------|
| `WEBHOOK_OPTIONS` | `'WEBHOOK_OPTIONS'` | Injection token for `WebhookModuleOptions` |
| `IDEMPOTENCY_STORE` | `'IDEMPOTENCY_STORE'` | Injection token for the webhook dedup `Map<string, number>` |
| `IDEMPOTENCY_CACHE` | `'IDEMPOTENCY_CACHE'` | Injection token for an external idempotency cache backend |
| `IDEMPOTENT_KEY` | `'idempotent'` | Reflect metadata key set by `@Idempotent()` |
| `IDEMPOTENT_TTL_KEY` | `'idempotent:ttl'` | Reflect metadata key for TTL set by `@Idempotent(ttl)` |

## Signature Headers by Provider

| Provider | Header |
|----------|--------|
| `stripe` | `stripe-signature` |
| `paypal` | `paypal-transmission-sig` |
| custom | `x-webhook-signature` |
