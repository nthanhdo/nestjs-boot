# Getting Started

## What is nestjs-boot?

nestjs-boot is a **runtime package** (not a boilerplate). You install it into any NestJS project and call `createApp()` with a single config object. It auto-wires infrastructure modules — database, cache, auth, health checks, logging, tracing, metrics — based on which config sections you provide. Omit a section and that module is not loaded.

## Installation

```bash
npm install nestjs-boot
```

Peer dependencies are loaded on demand. Install only what you use:

| Feature | Peer dependency |
|---------|----------------|
| Database | `mongoose`, `@nestjs/mongoose` |
| Cache (Redis L2) | `ioredis` |
| Cache (Memcached L1) | `memjs` |
| Auth (JWT) | `@nestjs/jwt`, `@nestjs/passport`, `passport-jwt` |
| Tracing | `@opentelemetry/sdk-node`, `@opentelemetry/auto-instrumentations-node` |
| Metrics | `prom-client` |
| Logging | `pino`, `pino-http`, `nestjs-pino` |
| Queue | `bullmq` |
| Swagger | `@nestjs/swagger` |
| Validation | `joi` (required — used for config validation) |

## Minimal example

```ts
// main.ts
import { createApp } from 'nestjs-boot';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await createApp(AppModule, {});
  await app.listen(3000);
}
bootstrap();
```

With zero config, you get:
- Health endpoint at `GET /health` (enabled by default)
- Global exception filter (enabled by default)
- DI circular-dependency scanner in dev mode
- `.env` file loading via dotenv (if installed)

## Progressive configuration

### Add a database

```ts
const app = await createApp(AppModule, {
  database: {
    connections: {
      master: {
        writerUri: 'mongodb://localhost:27017/myapp',
        readerUri: 'mongodb://reader:27017/myapp', // optional
      },
    },
  },
});
```

### Add cache

```ts
const app = await createApp(AppModule, {
  database: { /* ... */ },
  cache: {
    redis: { url: 'redis://localhost:6379' },
    defaultTtl: 300,
  },
});
```

### Add auth

```ts
const app = await createApp(AppModule, {
  database: { /* ... */ },
  cache: { /* ... */ },
  auth: {
    jwt: {
      secret: 'your-32-char-minimum-secret-key!!',
      signOptions: { expiresIn: '1h' },
    },
  },
});
```

## Boot sequence

When you call `createApp(AppModule, options)`, the following happens in order:

1. **Load `.env` files** — base `.env`, then `.env.{BOOT_ENV || NODE_ENV}` (override)
2. **Validate options** — Joi schema validates the entire config; fails fast with clear messages
3. **Init tracing** — OpenTelemetry SDK patches before NestFactory imports modules
4. **Build BootWrappedModule** — assembles infrastructure module imports based on config
5. **Create NestJS app** — with DI error enrichment (human-readable resolution failures)
6. **Enable API versioning** — if `versioning` config present
7. **Scan for circular deps** — dev mode only, non-blocking warnings
8. **Set app logger** — pino structured logger if `logging` configured
9. **Apply globals** — interceptors (response envelope, timeout, metrics, logging) and filters
10. **Connect transports** — gRPC, TCP, NATS, RabbitMQ microservice listeners
11. **Enable shutdown hooks** — if `shutdown` configured
12. **Layer enforcement** — validates import direction at boot (opt-in)
13. **Log config summary** — sanitized summary in dev mode
14. **Setup Swagger** — OpenAPI docs if `swagger` configured

## Configuration options overview

| Section | What it enables |
|---------|----------------|
| `database` | MongoDB multi-connection with reader/writer split |
| `cache` | Multi-layer cache (L1 memory + L2 Redis) |
| `auth` | JWT + API key + RBAC |
| `health` | Health check endpoint (default: enabled) |
| `response` | Response envelope + global error handler |
| `logging` | Pino structured logging |
| `metrics` | Prometheus metrics endpoint |
| `tracing` | OpenTelemetry distributed tracing |
| `transport` | gRPC, TCP, NATS, RabbitMQ microservices |
| `queue` | BullMQ job queues |
| `events` | Event bus (memory or Redis pub/sub) |
| `versioning` | API versioning (URI, header, or media-type) |
| `tenancy` | Multi-tenancy (header, subdomain, or path) |
| `swagger` | OpenAPI documentation |
| `websocket` | WebSocket with Redis scaling |
| `cqrs` | CQRS + Event Sourcing |
| `storage` | File storage (local, S3, GCS) |
| `webhooks` | Payment webhook handling (Stripe, PayPal) |
| `lazy` | Serverless cold-start optimization |

## Best practices

- **Start minimal** — add config sections as you need them. Unused sections cost zero.
- **Use `.env` files** — `createApp` auto-loads `.env` and `.env.{NODE_ENV}`. No extra setup.
- **Validate early** — config validation runs at boot. Fix errors before the app starts, not at runtime.
- **Use `BOOT_ENV`** — if you need a config profile different from `NODE_ENV`, set `BOOT_ENV`.

## Common pitfalls

- **JWT secret too short** — must be at least 32 characters (HMAC-SHA256 minimum). Validation will reject shorter values.
- **Missing peer dependencies** — nestjs-boot loads peers on demand. If you configure `cache.redis` without installing `ioredis`, it falls back to L1 only with a warning.
- **MongoDB URI format** — `writerUri` must start with `mongodb://` or `mongodb+srv://`. Validation rejects other formats.
- **Redis URI format** — must start with `redis://` or `rediss://`.
