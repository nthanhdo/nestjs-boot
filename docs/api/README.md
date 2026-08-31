# nestjs-boot API Reference

> Complete API documentation for all 32 modules in nestjs-boot.

## Core

| Module | Description |
|--------|-------------|
| [Config](config.md) | Bootstrap configuration, validation, env/secrets adapters |
| [Interfaces](interfaces.md) | Root `BootOptions` interface |
| [Common](common.md) | Exception filters, interceptors, CRUD base, error handling |
| [Logging](logging.md) | Structured logging with Pino |
| [Correlation](correlation.md) | Request correlation ID propagation |
| [Health](health.md) | Health checks (Terminus) with DB/Redis indicators |
| [Shutdown](shutdown.md) | Graceful shutdown with K8s support |

## Data

| Module | Description |
|--------|-------------|
| [Database](database.md) | Multi-connection MongoDB, reader/writer split, repositories; Prisma/PostgreSQL adapter |
| [Cache](cache.md) | Multi-layer cache (memory + Redis + Memcached), stampede guard |
| [Queue](queue.md) | BullMQ job queues with decorator-based processors |
| [CQRS](cqrs.md) | Command bus, event sourcing, sagas, outbox pattern |
| [Events](events.md) | In-process/Redis event bus with query support |

## Auth & Security

| Module | Description |
|--------|-------------|
| [Auth](auth.md) | JWT, API key, RBAC, social login, TOTP, sessions, token store, login tracker, privilege boundary, role manager |
| [Scope](scope.md) | Scope-based data access control (own → team → department → organization → system) |
| [Policy](policy.md) | Named policy engine for resource-level authorization |
| [Audit](audit.md) | Structured audit logging and security event tracking |
| [Inter-Service Auth](inter-service-auth.md) | Service-to-service auth context propagation |
| [Tenancy](tenancy.md) | Multi-tenancy (row/schema/database isolation) |

## Communication

| Module | Description |
|--------|-------------|
| [Transport](transport.md) | Microservice transports (gRPC, TCP, NATS, RabbitMQ) |
| [RPC](rpc.md) | gRPC error mapping and exception filter |
| [WebSocket](websocket.md) | WebSocket gateway base with Redis adapter |

## Observability

| Module | Description |
|--------|-------------|
| [Metrics](metrics.md) | Prometheus metrics (HTTP, DB, cache, queue) |
| [Tracing](tracing.md) | OpenTelemetry distributed tracing |
| [Alerts](alerts.md) | Multi-channel alerting (Slack, Discord, PagerDuty) |

## API Surface

| Module | Description |
|--------|-------------|
| [Swagger](swagger.md) | OpenAPI/Swagger setup and decorators |
| [Versioning](versioning.md) | API versioning (URI, header, media-type) |
| [Payments](payments.md) | Stripe/PayPal webhook handling with idempotency |
| [Storage](storage.md) | File storage (local, S3, GCS) |

## Architecture & Patterns

| Module | Description |
|--------|-------------|
| [Organizations](organizations.md) | Org/department/team hierarchy with membership management |
| [Contracts](contracts.md) | Service contract definitions and validation |
| [Layers](layers.md) | Architectural layer enforcement |
| [Resilience](resilience.md) | Circuit breaker, retry, timeout decorators |
| [Deploy](deploy.md) | Deploy hooks and readiness gates |

## Developer Tools

| Module | Description |
|--------|-------------|
| [Testing](testing.md) | Test app, factories, HTTP/gRPC clients, snapshots |
| [DI](di.md) | Circular dependency scanner, startup profiler |
| [Graph](graph.md) | Module dependency analysis and Mermaid rendering |
