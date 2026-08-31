# When to Use nestjs-boot

> **TL;DR** — Use nestjs-boot when you need production infrastructure (multi-DB, auth, RBAC, observability) wired in minutes. Skip it when your project is a single-model CRUD, GraphQL-first, serverless-only, or Prisma-primary with no Mongoose needs.

## When nestjs-boot adds value

### Microservices and multi-service architectures

You have 3+ NestJS services that all need auth, logging, health checks, and database connections. Without nestjs-boot, you copy-paste the same `JwtModule.register()`, `MongooseModule.forRoot()`, and health controller into every service. With nestjs-boot, each service calls `createApp(AppModule, { ... })` with a config object and gets all of that wired automatically.

### Multi-database / reader-writer split

Your application connects to multiple MongoDB instances or needs automatic reader/writer routing. `DatabaseModule` handles named connections, reader/writer split, and connection pooling through config — no custom provider wiring.

### RBAC, scope-based access, and policy authorization

You need role hierarchies, permission inheritance, deny-by-default, privilege boundaries, scope-based data filtering (OWN/TEAM/DEPT/ORG/SYSTEM), or resource-instance policy checks. nestjs-boot ships `RolesGuard`, `PermissionsGuard`, `ScopeGuard`, `PolicyGuard`, `PrivilegeBoundary`, and `RoleManager` — composable and globally registered via config.

### Quick prototyping with production patterns

You want to stand up a new service in under an hour with JWT auth, Swagger docs, structured logging, correlation IDs, graceful shutdown, and health checks — all following production patterns. The Backend Core template gives you 33 endpoints out of the box.

### Observability stack

You need OpenTelemetry tracing, Prometheus metrics, and structured logging (Pino) across all services with consistent configuration. nestjs-boot auto-wires interceptors for HTTP, database, and cache metrics.

## When nestjs-boot does NOT add value

### Simple single-model CRUD

If your entire app is one Mongoose model with 5 REST endpoints, the framework overhead is not justified. Use `@nestjs/mongoose` directly.

### GraphQL-first architecture

nestjs-boot is REST-centric. It does not provide GraphQL-specific guards, resolvers, or schema integration. If your API is primarily GraphQL, use `@nestjs/graphql` directly and wire auth manually.

### Serverless-only deployments (Lambda / Cloud Functions)

nestjs-boot assumes a long-running process (connection pooling, graceful shutdown, health checks). In serverless, cold starts and connection management work differently. The startup cost of `createApp()` may be too high for sub-200ms cold starts.

### Prisma as primary ORM (no Mongoose)

While nestjs-boot includes `PrismaModule` and `PrismaBaseRepository`, the core `DatabaseModule` (reader/writer split, `CachedBaseRepository`, `Specification`, `UnitOfWork`) is Mongoose-based. If you only use Prisma, you get less value from the database layer. Consider using Prisma's built-in features directly.

### Nx monorepo with its own infrastructure

If you already use Nx with shared libraries for auth, logging, and database, adding nestjs-boot creates a second abstraction layer. Choose one.

## Comparison table

| Capability | Raw NestJS + @nestjs/cli | nestjs-boot | Nx monorepo |
|---|---|---|---|
| Project scaffolding | `nest new` (empty) | `createApp()` with config | `nx generate` with workspace |
| Auth (JWT + API key + RBAC) | Manual wiring | Config-driven, global guards | Manual or shared lib |
| Multi-DB connections | Manual provider per DB | Config object, named connections | Manual or shared lib |
| Reader/writer split | Custom code | Built-in, automatic routing | Custom code |
| Role hierarchy + inheritance | Build from scratch | `RoleHierarchy` + `PrivilegeBoundary` | Build from scratch |
| Scope-based data filtering | Build from scratch | `ScopeModule` + `buildScopeFilter` | Build from scratch |
| Observability (traces + metrics + logs) | Wire each library | Config sections auto-wire | Shared config lib |
| Health checks | Manual controller | Auto-registered | Plugin or manual |
| Migration runner | External tool | Built-in `MigrationModule` | External tool |
| Cache (multi-layer) | Manual Redis/Memcached | `CacheModule` with L1/L2 | Manual or shared lib |
| Swagger | Manual setup | Config section | Manual |
| Graceful shutdown | Manual signals | Config section | Manual |
| Multi-tenancy | Build from scratch | `TenancyModule` with 3 isolation models | Build from scratch |
| Learning curve | Low (just NestJS) | Medium (NestJS + nestjs-boot APIs) | Medium-High (NestJS + Nx) |
| Lock-in | None | Moderate (swappable — standard NestJS underneath) | Moderate (Nx tooling) |

## Team size guidelines

### Solo developer / small team (1-3)

**Recommended when:** You are building multiple services or need auth + RBAC + observability quickly. The config-driven approach saves significant boilerplate time.

**Skip when:** You are building a single simple API. The abstraction layer adds complexity without proportional benefit.

### Small team (4-10)

**Recommended.** Consistency across services is valuable. New team members learn one `createApp()` config pattern instead of discovering different auth/logging/database setups in each service. The Backend Core template provides a standardized starting point.

### Enterprise (10+)

**Evaluate carefully.** nestjs-boot works well as a shared runtime package across teams. However, large organizations may prefer their own internal platform library built on the same patterns. Consider forking or wrapping nestjs-boot rather than depending on it directly.

## Decision checklist

Answer these questions to decide:

1. **Do you need 2+ of: JWT auth, RBAC, multi-DB, observability, caching?** Yes → nestjs-boot saves significant wiring time.
2. **Is your ORM Mongoose?** Yes → full value from `DatabaseModule`. Prisma-only → partial value.
3. **Is your API REST?** Yes → full value. GraphQL-only → limited value.
4. **Is your deployment long-running (container/VM)?** Yes → full value. Serverless → limited value.
5. **Do you have an existing infrastructure library?** Yes → evaluate overlap before adding.

If you answered "Yes" to questions 1-4 and "No" to question 5, nestjs-boot is a strong fit.

## See also

- [Getting Started](getting-started.md) — install and first `createApp()` call
- [Configuration](configuration.md) — all BootOptions sections
- [Migration from NestJS](migration-from-nestjs.md) — adopting nestjs-boot in an existing project
