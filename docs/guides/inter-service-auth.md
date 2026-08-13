# Inter-Service Auth — nestjs-boot

> Automatically propagate JWT tokens and API keys across microservice boundaries.

---

## Overview

When Service A calls Service B, the caller's auth context (JWT or API key) should propagate so that Service B can enforce the same permissions. `InterServiceAuthModule` handles this transparently using `AsyncLocalStorage`.

**Flow:** Incoming request -> `AuthPropagationInterceptor` extracts credentials -> stores in `AsyncLocalStorage` -> outgoing call reads context via `buildAuthHeaders` or `injectAuthIntoPayload`.

---

## Setup

```ts
import { InterServiceAuthModule } from 'nestjs-boot';

@Module({
  imports: [
    InterServiceAuthModule.register({
      propagation: 'jwt',              // 'jwt' | 'api-key' | 'both'
      serviceToken: process.env.SERVICE_TOKEN,  // fallback when no user context
      headerName: 'Authorization',     // default
      apiKeyHeaderName: 'x-api-key',   // default
    }),
  ],
})
export class AppModule {}
```

The module is registered globally. The `AuthPropagationInterceptor` is applied as a global interceptor automatically.

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `propagation` | `'jwt' \| 'api-key' \| 'both'` | required | Which credentials to extract and propagate |
| `serviceToken` | `string` | `undefined` | Static service-to-service token used when no user context is present |
| `headerName` | `string` | `'Authorization'` | Header name for JWT extraction |
| `apiKeyHeaderName` | `string` | `'x-api-key'` | Header name for API key extraction |

---

## AuthPropagationInterceptor

Applied globally on registration. For each incoming request it:

1. Extracts the JWT from the `Authorization: Bearer <token>` header (if `propagation` is `'jwt'` or `'both'`)
2. Extracts the API key from the `x-api-key` header (if `propagation` is `'api-key'` or `'both'`)
3. Falls back to `serviceToken` when neither is present
4. Stores the context in `AsyncLocalStorage` for the request lifetime

Works for both HTTP and RPC contexts.

---

## Auth Context API

### getAuthContext

Read the current auth context (available inside any request handler or service call within the same async chain).

```ts
import { getAuthContext } from 'nestjs-boot';

const ctx = getAuthContext();
// ctx?.token    — JWT string (without 'Bearer ' prefix)
// ctx?.apiKey   — API key string
// ctx?.metadata — arbitrary key-value pairs
```

Returns `undefined` if called outside a request context.

### setAuthContext

Modify the current auth context within a `runWithAuthContext` callback.

```ts
import { setAuthContext } from 'nestjs-boot';

setAuthContext({
  metadata: { 'x-trace-id': traceId },
});
```

Only works inside an active context. Merges metadata rather than replacing it.

### runWithAuthContext

Run a function within an explicit auth context. Useful for background jobs or tests.

```ts
import { runWithAuthContext } from 'nestjs-boot';

await runWithAuthContext(
  { token: serviceJwt, metadata: { 'x-source': 'cron-job' } },
  async () => {
    // All calls inside here see this auth context
    await orderService.processExpiredOrders();
  },
);
```

---

## Outgoing Calls

### buildAuthHeaders — HTTP Transports

Reads the current `AsyncLocalStorage` context and builds headers for outgoing HTTP requests.

```ts
import { buildAuthHeaders } from 'nestjs-boot';

// In an HttpService interceptor or custom client:
const headers = buildAuthHeaders();
// { 'Authorization': 'Bearer eyJ...', 'x-api-key': 'abc123', ...metadata }

await httpService.get('http://user-service/users/123', { headers });
```

Falls back to `serviceToken` when no context is present:

```ts
const headers = buildAuthHeaders({ serviceToken: process.env.SERVICE_TOKEN });
```

### injectAuthIntoPayload — Non-HTTP Transports

For TCP, NATS, RabbitMQ, and other message-based transports, injects an `__auth` field into the message payload.

```ts
import { injectAuthIntoPayload } from 'nestjs-boot';

const payload = injectAuthIntoPayload(
  { userId: '123', action: 'debit' },
  { serviceToken: process.env.SERVICE_TOKEN },
);
// {
//   userId: '123',
//   action: 'debit',
//   __auth: { token: 'eyJ...', apiKey: 'abc', metadata: { ... } }
// }

client.emit('payment.process', payload);
```

The receiving service can extract `__auth` and call `runWithAuthContext` to restore the context.

---

## Example: Full Propagation Chain

```ts
// gateway-service/app.module.ts
InterServiceAuthModule.register({
  propagation: 'both',
  serviceToken: process.env.INTER_SERVICE_TOKEN,
})

// gateway-service/order.controller.ts
@Get('orders/:id')
async getOrder(@Param('id') id: string) {
  // Auth context is automatically captured by the interceptor
  const headers = buildAuthHeaders();
  const order = await this.httpService.get(
    `http://order-service/orders/${id}`,
    { headers },
  );
  return order.data;
}

// order-service — receives the same JWT, enforces same permissions
```
