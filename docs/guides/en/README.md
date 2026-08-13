# nestjs-boot — Documentation Index

## Getting Started

| Guide | Description |
|-------|-------------|
| [Getting Started](getting-started.md) | Install, minimal example, boot sequence, config overview |
| [Configuration](configuration.md) | BootOptions reference, env files, config adapters, validation |
| [CLI Reference](cli-reference.md) | `npx nestjs-boot new` — scaffold a project with one command |
| [Migration from NestJS](migration-from-nestjs.md) | Adopt nestjs-boot in an existing NestJS project, phase by phase |

## Core Modules

| Guide | Description |
|-------|-------------|
| [Database](database.md) | MongoDB multi-connection, reader/writer split, BaseRepository, migrations |
| [Cache](cache.md) | Multi-layer cache (L1 memory + L2 Redis), stampede guard, tags, warming |
| [Authentication](authentication.md) | JWT, refresh tokens, password reset, email verification, API keys, WebSocket auth |
| [Authorization (RBAC)](authorization.md) | Role-based and permission-based access control |
| [Error Handling](error-handling.md) | BootException, error codes, global filters, RFC 7807, error boundaries |
| [Event Bus](events.md) | In-process or Redis pub/sub, typed events, request/reply queries |
| [Queue (BullMQ)](queue.md) | Job queues with decorator-based processors |

## Architecture & DI

| Guide | Description |
|-------|-------------|
| [DI Contracts, Layers & Diagnostics](di-contracts-layers.md) | Contract-based DI, architectural layer enforcement, module graph analysis |
| [DI Best Practices](di-best-practices.md) | Barrel file gotcha, SharedModule pattern, forwardRef warnings |
| [Circular Dependency Prevention](circular-dependency-prevention.md) | 5 patterns to eliminate circular deps — decision tree + copy-paste examples |

## Microservices & Transport

| Guide | Description |
|-------|-------------|
| [Transport & Microservices](transport-microservices.md) | gRPC, TCP, NATS, RabbitMQ — clients, resilience, service discovery, error propagation |
| [Transport Selection Guide](transport-selection.md) | Decision matrix: which transport to use and when |
| [Inter-Service Auth](inter-service-auth.md) | Propagate JWT/API keys across microservice boundaries |

## Observability & Resilience

| Guide | Description |
|-------|-------------|
| [Observability](observability.md) | Correlation IDs, OpenTelemetry tracing, Prometheus metrics, structured logging |
| [Resilience](resilience.md) | Circuit breaker, retry with backoff, timeout — as decorators |
| [Health Checks & Graceful Shutdown](health-shutdown.md) | Auto-detecting health indicators, ordered shutdown, Kubernetes integration |

## Auth Extensions

| Guide | Description |
|-------|-------------|
| [Session, Social Login & TOTP](session-social-totp.md) | Cookie sessions, Google/GitHub OAuth, two-factor authentication |
| [Rate Limiting Auth](auth-rate-limiting.md) | Rate limiting auth endpoints with @nestjs/throttler |

## Advanced Features

| Guide | Description |
|-------|-------------|
| [CQRS & Event Sourcing](cqrs-event-sourcing.md) | CommandBus, AggregateRoot, EventStore, snapshots, outbox, projections |
| [Multi-Tenancy](multi-tenancy.md) | Header/subdomain/path tenant extraction, row/schema/database isolation |
| [API Versioning](api-versioning.md) | URI, header, or media-type versioning with deprecation tracking |
| [File Storage](file-storage.md) | Local, S3, GCS — unified API with validation and signed URLs |
| [Payments & Webhooks](payments-webhooks.md) | Stripe/PayPal webhook verification, event normalization, idempotency |
| [WebSocket](websocket.md) | Socket.IO with Redis scaling, room management, auth guards |
| [Swagger / OpenAPI](swagger.md) | Auto-configured Swagger UI with security schemes and pagination docs |

## Testing

| Guide | Description |
|-------|-------------|
| [Testing Guide](testing-guide.md) | createTestApp, test client, factories, auth mocks, gRPC/message testing |

## Operations

| Guide | Description |
|-------|-------------|
| [Production Checklist](production-checklist.md) | Pre-deploy checklist: security, database, cache, health, observability |
| [Serverless Considerations](serverless-considerations.md) | Cold start analysis, when to use (and not use) nestjs-boot on Lambda |

## Reading Order for New Developers

1. **[Getting Started](getting-started.md)** — understand what nestjs-boot is and get a working app
2. **[Configuration](configuration.md)** — learn the BootOptions config model
3. **[Database](database.md)** + **[Cache](cache.md)** — set up data layer
4. **[Authentication](authentication.md)** + **[Authorization](authorization.md)** — secure your API
5. **[Error Handling](error-handling.md)** — structured errors across your app
6. **[Testing Guide](testing-guide.md)** — write tests with built-in utilities
7. **[Production Checklist](production-checklist.md)** — before you deploy
8. Pick advanced guides as needed (CQRS, multi-tenancy, microservices, etc.)
