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

## [0.1.0] — 2026-08-13

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

[Unreleased]: https://github.com/nthanhdo/nestjs-boot/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/nthanhdo/nestjs-boot/releases/tag/v0.1.0
