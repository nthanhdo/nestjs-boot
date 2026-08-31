# Health API Reference

> Auto-configuring health check module that exposes a `GET /health` endpoint via `@nestjs/terminus`, with database and Redis indicators wired from your boot options.

---

## Module Registration

```ts
import { HealthModule } from 'nestjs-boot/health';

// Inside BootModule or AppModule (typically called by nestjs-boot internally)
HealthModule.register(bootOptions)
```

`HealthModule` is **not** global — it registers a dynamic `GET` controller at the configured path and is intended to be composed by the top-level `BootModule`.

---

## Classes

### `HealthModule`

#### Static Methods

##### `register(options: BootOptions): DynamicModule`

Build and return the dynamic module.

| Parameter | Type | Description |
|-----------|------|-------------|
| `options` | `BootOptions` | Full boot options. Only `options.database`, `options.cache.redis`, and `options.health.path` are consumed. |

**Behaviour:**

| Condition | Effect |
|-----------|--------|
| `options.database` is set | `DatabaseHealthIndicator` is registered and included in health checks. |
| `options.cache.redis` is set | `RedisHealthIndicator` is registered and included via `CACHE_SERVICE`. |
| `options.health?.path` | Controller is mounted at this path. Defaults to `'/health'`. |

**Imports:** `TerminusModule`

---

### `HealthController`

HTTP controller that runs all registered health indicators on `GET {path}`.

#### Methods

##### `check(): Promise<HealthCheckResult>`

Run all active health indicators and return a `HealthCheckResult`.

**Returns 503** (`ServiceUnavailableException`) when a graceful shutdown is in progress (detected via `ShutdownService`). This causes Kubernetes readiness probes to fail immediately, removing the pod from the load balancer before connections are drained.

**Returns 200** with a `{ status: 'ok', info: {...} }` body when all checks pass.

**Returns 503** (via `@nestjs/terminus`) when any indicator is unhealthy.

---

### `DatabaseHealthIndicator`

Checks the readyState of every configured Mongoose connection.

Extends `@nestjs/terminus` `HealthIndicator`.

#### Methods

##### `isHealthy(key?: string): Promise<HealthIndicatorResult>`

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `key` | `string` | `'database'` | Key name in the health check response body. |

Iterates over all connection names in `DatabaseOptions.connections` and checks `mongoose.connections[n].readyState === 1`.

**Throws:** `HealthCheckError` if any connection is not ready (readyState !== 1).

---

### `RedisHealthIndicator`

Verifies Redis connectivity by performing a round-trip `set` / `get` / `del` via `MultiCacheService`.

Extends `@nestjs/terminus` `HealthIndicator`.

#### Constructor

```ts
constructor(cacheService?: MultiCacheService)
```

`cacheService` is injected via `CACHE_SERVICE` token and is optional. If not present, the check reports `{ status: 'not configured' }` as healthy.

#### Methods

##### `isHealthy(key?: string): Promise<HealthIndicatorResult>`

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `key` | `string` | `'redis'` | Key name in the health check response body. |

Writes `'ok'` to `__nestjs_boot_health_check__` with a 5-second TTL, reads it back, then deletes it.

**Throws:** `HealthCheckError` if the round-trip fails or returns an unexpected value.

---

## Example Response

```json
{
  "status": "ok",
  "info": {
    "database": { "status": "up" },
    "redis": { "status": "up" }
  },
  "error": {},
  "details": {
    "database": { "status": "up" },
    "redis": { "status": "up" }
  }
}
```

When a check fails the HTTP status is `503` and the failing key moves to the `error` field.
