# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Alerts module** — multi-channel alert notifications (Console, Webhook, Slack, Discord, PagerDuty) with rule-based evaluation
- **Deploy hooks module** — lifecycle hooks for deploy phases (`@OnDeploy`), built-in `EnvValidationHook`, `DependencyCheckHook`, `ReadinessGateHook`
- **Circuit breaker observability** — `CircuitBreakerObservability` + `CircuitBreakerStateChangeEvent` for monitoring state transitions
- **Terraform templates** — infrastructure-as-code guide for cloud provisioning
- **Nginx load balancing** — load balancing configuration guide
- **Container deployment** — Docker production setup with `docker-compose.prod` and CI docker build+push guide
- **541 tests** across all modules (up from 506)

## [0.1.7] — 2026-09-17

### Added

- **Content service README** — comprehensive documentation (534 lines) covering quick start, configuration, architecture, API reference, GraphQL, search, webhooks, deployment, and vs Strapi comparison

## [0.1.6] — 2026-09-17

### Added

- **GraphQL delivery endpoint** — optional `/graphql` with queries: `contentTypes`, `entries(type, locale, search)`, `entry(slug)`, `asset(id)`. Enable via `content.graphql: true`
- **Mock UI** — static HTML demo at `/content-ui` with content type builder, entry CRUD, publishing workflow, asset browser, locale/webhook/API key management
- **Seed data** — `seedContentData(prismaClient)` creates sample Blog Post, Product, FAQ types + 8 entries (EN/VI) + SEO component + locales
- **Additional exports** — `ContentApiKeyGuard`, `ContentPermissionGuard`, `ContentPermissions`, `ContentEvents`, `seedContentData`

## [0.1.5] — 2026-09-17

### Fixed

- **Health endpoint bypasses JWT auth** — `/health`, `/healthz`, `/readyz` now marked `@Public()` (`boot:isPublic` metadata) so global JWT guard skips them. Previously returned 401 when `auth.jwt` was configured.

## [0.1.4] — 2026-09-17

### Fixed

- **HealthModule ShutdownService DI — complete fix** — v0.1.3 renamed the token but didn't register a fallback provider. When `shutdown` is not configured, `BOOT_SHUTDOWN_SERVICE` now resolves to `null` via a local provider in HealthModule. When ShutdownModule IS loaded (global), its real provider takes precedence. Fixes crash loop on NestJS 12 for all configurations.

## [0.1.3] — 2026-09-17

### Added

- **Content service module** — full Headless CMS (simpler than Strapi) with:
  - Dynamic content types with reusable components (16 field types)
  - Entry CRUD with JSONB data storage, versioning, soft delete
  - Publishing workflow: Draft → Approved → Scheduled → Published
  - Localization (EN/VI) with field-level fallback chain
  - PostgreSQL full-text search (`tsvector` + `pg_trgm` + `unaccent` for Vietnamese)
  - Media/asset management via StorageModule (R2/S3)
  - Webhook dispatch with HMAC-SHA256 signature + exponential backoff retry
  - Delivery API (read-only, API key auth) + Management API (JWT + RBAC)
  - Row-level multi-tenancy
  - Service ON/OFF via `.env` config — standalone deployable
  - Docker-compose for standalone content-service
  - 38 new tests (938 total across 102 test files)
- **GraphQL peer deps** — `@nestjs/graphql`, `@nestjs/apollo`, `@apollo/server` added as optional peer dependencies for Delivery API GraphQL endpoint
- **Prisma schema** — 9 new models in `content` schema (ContentType, ContentEntry, ContentEntryVersion, ContentComponent, ContentAsset, ContentLocale, ContentApiKey, ContentWebhook, ContentWebhookLog)

### Fixed

- **BootRpcExceptionFilter NestJS 12 crash** — filter now registered under both `APP_FILTER` and class token so `app.get(BootRpcExceptionFilter)` resolves correctly in NestJS 12's stricter DI context
- **DynamicHealthController ShutdownService DI failure** — replaced class token `@Inject(ShutdownService)` with string token `'BOOT_SHUTDOWN_SERVICE'` to avoid NestJS 12 compile-time resolution failure when ShutdownModule is not configured. Both fixes unblock 7 production services stuck in crash loop on NestJS 12 + gRPC transport

## [0.1.2] — 2026-09-17

### Fixed

- **Widen NestJS peer deps** — `@nestjs/common`, `@nestjs/core`, `@nestjs/microservices`, `@nestjs/mongoose`, `@nestjs/websockets` now accept `^10.0.0 || ^11.0.0 || ^12.0.0`; `@nestjs/swagger` accepts `^7.0.0 || ^8.0.0 || ^12.0.0`. Consumers on NestJS v10/v11 no longer forced to upgrade ([#1](https://github.com/nthanhdo/nestjs-boot/issues/1))
- **`@nestjs/terminus` stays `^12.0.0`** (required by `HealthIndicatorService` API) but is marked optional — consumers not using the health module are unaffected

## [0.1.1] — 2026-09-17

### Fixed

- **Health module no longer crashes without MongoDB** — all health indicators (`DatabaseHealthIndicator`, `RedisHealthIndicator`, `QueueHealthIndicator`) are now lazy-loaded via `dynamic import()`, so `mongoose` is only required when `options.database` is actually configured ([#1](https://github.com/nthanhdo/nestjs-boot/issues/1), [#2](https://github.com/nthanhdo/nestjs-boot/pull/2))
- **`events.transport` auto-inferred from config** — the `transport` field is now optional; when omitted, it defaults to `'redis'` if `redis` config is present, otherwise `'memory'` ([#1](https://github.com/nthanhdo/nestjs-boot/issues/1))
- **Static mongoose imports converted to `import type`** — ~90 files changed from value imports to type-only imports so `import 'nestjs-boot'` no longer crashes in projects without `mongoose` installed ([#1](https://github.com/nthanhdo/nestjs-boot/issues/1))
- **esbuild build failures resolved** — all interface/type imports across the codebase are now `import type`, fixing tsup/esbuild "No matching export" errors during `npm run build`

### Changed

- **Upgraded NestJS v10 → v12** — `@nestjs/core`, `@nestjs/common`, `@nestjs/platform-express`, `@nestjs/mongoose`, `@nestjs/terminus`, `@nestjs/testing`, `@nestjs/websockets`, `@nestjs/swagger`, `@nestjs/config`, `@nestjs/microservices`, `@nestjs/bull`, `@nestjs/throttler`
- **Upgraded vitest v3 → v4.1.11** — added `@swc/core` + `unplugin-swc` for decorator support in the new vitest transformer
- **Health indicators migrated to `@nestjs/terminus` v12 API** — replaced deprecated `HealthIndicator` base class and `HealthCheckError` with new `HealthIndicatorService` pattern
- **Resolved all high-severity npm audit findings** — multer DoS vulnerabilities (via `@nestjs/platform-express` v12), js-yaml CPU exhaustion, body-parser limit bypass. 4 remaining moderate/low vulns are unfixable upstream (uuid in bull, esbuild Windows-only)
- **900 tests passing** across 97 test files

## [0.1.0] — 2026-08-13 (unreleased, no Git tag)

### Added

- **Core framework scaffold** — ConfigModule, DatabaseModule, CacheModule, HealthModule, `createApp` factory
- **CacheModule** — multi-layer L1+L2 cache with size-aware routing
- **DatabaseModule** — multi-connection support + Memcached + Auth/RBAC module
- **CachedRepository** — repository pattern with transparent cache integration
- **Microservice example architecture** — 5-service and 10-service complete enterprise examples
- **Wave 1–4 modules** — Microservice-Capable, Production-Ready, Enterprise, DX layers
- **CLI Tier 1+2** — interactive prompts, multi-DB selection, auto-install
- **Learning Skeleton + Web Generator**
- **Admin Dashboard** — Next.js 15 visual management UI
- **11 pain-point modules** — 411 tests covering real-world NestJS bottlenecks
- **4 circular-dependency solutions** — events, contracts, graph, layers strategies
- **CQRS / Event Sourcing module** — complete DDD pattern implementation
- **Patterns PP13–20** — Versioning, Multi-tenancy, Migrations, Swagger, WebSocket, Cache Advanced, Payments, Storage
- **31 architectural patterns** — SOLID, Unit of Work, Specification, Saga, and more
- **DI error enricher, CrudService, config dump, testing guide**
- **Visualize Flow** — interactive HTML5+CSS3 animated architecture visualization (10 sections, ~50 sub-flows)
- **Vietnamese README** (`README.vi.md`) with proper diacritics
- **506+ tests** across all modules

### Fixed

- JWT secret minimum 32 chars enforcement + separate reset secret
- `refreshSecret`/`resetSecret` min(32) enforcement + dynamic import for CLI deps
- Bounded idempotency cache to prevent unbounded memory growth
- PayPal webhook verify deprecation path
- Path traversal guard in file-serving utilities
- JWT algorithm pinning to prevent algorithm-confusion attacks
- 7 SOLID violations resolved across modules
- 28 missing exports audited and added
- All P0+P1 audit findings resolved
- OpenTelemetry require mock in tracing test (devDep alignment)

### Changed

- README rewritten — Kano-informed, leads with unique features, accurate badges
- Roadmap cleaned up, deps restructured for optional peer dependencies
- Architecture Mermaid diagram: LR layout, color-coded, reduced clutter

[Unreleased]: https://github.com/nthanhdo/nestjs-boot/compare/v0.1.2...HEAD
[0.1.2]: https://github.com/nthanhdo/nestjs-boot/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/nthanhdo/nestjs-boot/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/nthanhdo/nestjs-boot/releases/tag/v0.1.0
