# Inter-Service Auth API Reference

> Propagate JWT and/or API-key credentials from incoming requests to outgoing inter-service calls using `AsyncLocalStorage` — no manual header threading required.

---

## Module Registration

```ts
import { InterServiceAuthModule } from 'nestjs-boot/inter-service-auth';

InterServiceAuthModule.register({
  propagation: 'jwt',          // or 'api-key' or 'both'
  serviceToken: 'secret-s2s',  // optional static token for service-to-service calls
  headerName: 'Authorization', // optional, default: 'Authorization'
  apiKeyHeaderName: 'x-api-key', // optional, default: 'x-api-key'
})
```

`InterServiceAuthModule` is registered as **global** and applies `AuthPropagationInterceptor` as an `APP_INTERCEPTOR`, so every incoming request automatically seeds the `AsyncLocalStorage` context.

---

## Module

### `InterServiceAuthModule`

#### Static Methods

##### `register(options: InterServiceAuthOptions): DynamicModule`

| Parameter | Type | Description |
|-----------|------|-------------|
| `options` | [`InterServiceAuthOptions`](#interserviceauthoptions) | Auth propagation configuration. |

**Providers registered:**
- `INTER_SERVICE_AUTH_OPTIONS` — the options value.
- `APP_INTERCEPTOR` — `AuthPropagationInterceptor` applied globally.

**Exports:** `INTER_SERVICE_AUTH_OPTIONS`

---

## Classes

### `AuthPropagationInterceptor`

Global NestJS interceptor that extracts auth credentials from every incoming HTTP or RPC request and stores them in `AsyncLocalStorage`.

Implements `NestInterceptor`.

#### `intercept(context: ExecutionContext, next: CallHandler): Observable<any>`

1. Extracts `Authorization: Bearer <token>` (for `propagation: 'jwt'` or `'both'`).
2. Extracts `x-api-key` (for `propagation: 'api-key'` or `'both'`).
3. Falls back to `serviceToken` when neither credential is present.
4. Runs the handler inside `authContextStorage.run(authContext, ...)` so downstream code can access the context via `getAuthContext()`.

Supports HTTP contexts and RPC (TCP/NATS/RMQ) contexts transparently.

---

## Functions

### `getAuthContext(): AuthContext | undefined`

Get the current auth context from `AsyncLocalStorage`. Returns `undefined` when called outside an interceptor-managed request scope (e.g., in a background job).

```ts
import { getAuthContext } from 'nestjs-boot/inter-service-auth';

const ctx = getAuthContext();
if (ctx?.token) { /* propagate */ }
```

---

### `setAuthContext(ctx: Partial<AuthContext>): void`

Mutate fields on the current `AsyncLocalStorage` store. Only works inside a `runWithAuthContext` callback or within an active interceptor scope.

| Parameter | Type | Description |
|-----------|------|-------------|
| `ctx` | `Partial<AuthContext>` | Fields to merge into the current context. `metadata` is shallowly merged. |

---

### `runWithAuthContext<T>(ctx: AuthContext, fn: () => T): T`

Run a synchronous or promise-returning function inside a new `AsyncLocalStorage` context. Use in tests or background workers where no interceptor is active.

| Parameter | Type | Description |
|-----------|------|-------------|
| `ctx` | [`AuthContext`](#authcontext) | The auth context to make available inside `fn`. |
| `fn` | `() => T` | Function to execute within the context. |

**Returns:** `T` — whatever `fn` returns (including `Promise<T>`).

```ts
await runWithAuthContext({ token: 'abc' }, async () => {
  await myService.doSomething(); // getAuthContext() returns { token: 'abc' } here
});
```

---

### `buildAuthHeaders(options?): Record<string, string>`

Build an HTTP headers object from the current auth context. Use when making outgoing HTTP calls (e.g., with `HttpService`) to propagate credentials.

| Parameter | Type | Description |
|-----------|------|-------------|
| `options` | `Pick<InterServiceAuthOptions, 'headerName' \| 'apiKeyHeaderName' \| 'serviceToken'>` | Optional overrides for header names and fallback service token. |

**Returns:** `Record<string, string>` — headers ready to merge into an Axios config or `fetch` init.

**Behaviour:**
- If an auth context exists: includes `Authorization: Bearer <token>` and/or `x-api-key: <key>` as configured, plus all `metadata` entries as individual headers.
- If no auth context: uses `options.serviceToken` as the bearer token (if provided).
- If neither: returns `{}`.

```ts
import { buildAuthHeaders } from 'nestjs-boot/inter-service-auth';

const headers = buildAuthHeaders();
await this.httpService.get('http://other-service/api', { headers }).toPromise();
```

---

### `injectAuthIntoPayload<T>(data: T, options?): T & { __auth? }`

Inject auth context into a message payload for non-HTTP transports (TCP, NATS, RabbitMQ). Adds an `__auth` field to the data object.

| Parameter | Type | Description |
|-----------|------|-------------|
| `data` | `T extends Record<string, any>` | Original message payload. |
| `options` | `Pick<InterServiceAuthOptions, 'serviceToken'>` | Fallback service token. |

**Returns:** A new object with all original fields plus an `__auth` field:

```ts
{
  ...data,
  __auth?: {
    token?: string;
    apiKey?: string;
    metadata?: Record<string, string>;
  }
}
```

Returns `data` unmodified if there is no auth context and no `serviceToken`.

---

## Interfaces

### `InterServiceAuthOptions`

```ts
interface InterServiceAuthOptions {
  /** Which credentials to propagate. */
  propagation: 'jwt' | 'api-key' | 'both';

  /** Static service-to-service bearer token used when no user context is present. */
  serviceToken?: string;

  /** Incoming/outgoing auth header name. Default: 'Authorization' */
  headerName?: string;

  /** Incoming/outgoing API key header name. Default: 'x-api-key' */
  apiKeyHeaderName?: string;
}
```

### `AuthContext`

```ts
interface AuthContext {
  /** Bearer token extracted from the incoming request. */
  token?: string;

  /** API key extracted from the incoming request. */
  apiKey?: string;

  /** Arbitrary string metadata to propagate as headers. */
  metadata?: Record<string, string>;
}
```

---

## Constants / Tokens

| Constant | Value | Description |
|----------|-------|-------------|
| `INTER_SERVICE_AUTH_OPTIONS` | `'BOOT_INTER_SERVICE_AUTH_OPTIONS'` | Injection token for the `InterServiceAuthOptions` value. |
| `DEFAULT_AUTH_HEADER` | `'Authorization'` | Default header used for JWT propagation. |
| `DEFAULT_API_KEY_HEADER` | `'x-api-key'` | Default header used for API key propagation. |
