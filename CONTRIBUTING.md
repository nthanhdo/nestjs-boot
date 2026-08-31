# Contributing to nestjs-boot

Thank you for your interest in contributing! This guide covers everything you need to get started.

## Getting Started

```bash
git clone https://github.com/nthanhdo/nestjs-boot.git
cd nestjs-boot
npm install
npm run build       # CJS + ESM + DTS
npx vitest run      # run all tests (~900 tests)
```

### Prerequisites

- Node.js >= 18
- npm >= 9
- MongoDB integration tests use MongoMemoryServer (no external instance needed)

## Project Structure

```
nestjs-boot/
  src/                  # 60+ framework modules (each a NestJS DynamicModule)
    create-app.ts       # Entry point — the createApp() function
    index.ts            # Root barrel export (foundation-level modules)
    interfaces/         # BootOptions and shared types
    auth/               # JWT, RBAC, API key, social, TOTP, break-glass
    cache/              # L1 memory + L2 Redis/Memcached
    config/             # Joi validation, env profiles, secret adapters
    contracts/          # Interface-based DI tokens
    correlation/        # X-Correlation-Id propagation
    cqrs/               # Command bus, event store, saga, outbox
    database/           # Mongoose multi-connection, Prisma, IRepository<T>
    deploy/             # Deploy lifecycle hooks
    di/                 # DI error enrichment
    events/             # In-process / Redis event bus
    graph/              # Module dependency graph analysis
    health/             # Terminus health checks
    layers/             # Module layer enforcement
    logging/            # Pino structured logging
    metrics/            # Prometheus metrics
    organizations/      # Org/dept/team hierarchy
    payments/           # Stripe/PayPal webhook verification
    plugin/             # BootPlugin interface
    policy/             # Named authorization policies
    queue/              # BullMQ job processing
    resilience/         # Circuit breaker, retry, timeout
    scope/              # OWN/TEAM/DEPT/ORG/SYSTEM scopes
    shutdown/           # Graceful shutdown
    storage/            # File storage (local, S3, GCS)
    swagger/            # OpenAPI auto-config
    tenancy/            # Multi-tenancy
    testing/            # Test utilities (suites, factories, clients)
    tracing/            # OpenTelemetry
    transport/          # gRPC, TCP, NATS, RabbitMQ
    versioning/         # API versioning
    websocket/          # WebSocket with Redis adapter
  tests/                # Integration and unit tests
  templates/            # CLI scaffolding templates (used by `npx nestjs-boot new`)
  bin/                  # CLI entry point (create.mjs)
  docs/
    guides/en/          # User-facing guides (getting-started, prisma, auth, etc.)
    api/                # API reference docs
    teaching/           # Teaching materials
  examples/             # Example projects (microservices, learning skeleton)
  packages/             # Web generator, admin dashboard, visualize-flow
  scripts/              # Deploy and build scripts
```

## Adding a New Module

Follow these steps to add a new module to the framework:

1. **Create the module directory** under `src/`:
   ```
   src/my-module/
     my-module.module.ts
     my-module.service.ts
     index.ts              # barrel export
   ```

2. **Add the config key to `BootOptions`** in `src/interfaces/boot-options.interface.ts`:
   ```ts
   myModule?: {
     enabled?: boolean;
     // ... module-specific options
   };
   ```

3. **Add Joi validation** for the new config section in the options validation schema.

4. **Add the lazy loader** in `src/create-app.ts` — when `options.myModule` is present, import the module:
   ```ts
   if (options.myModule) {
     imports.push(MyModuleModule.register(options.myModule));
   }
   ```

5. **Add a subpath export** in `package.json`:
   ```json
   "./my-module": {
     "types": "./dist/my-module/index.d.ts",
     "require": "./dist/my-module/index.js",
     "import": "./dist/my-module/index.mjs"
   }
   ```

6. **Export from `src/index.ts`** if the module is foundation-level (used by most consumers). Specialized modules should only be available via subpath import (`nestjs-boot/my-module`).

7. **Write tests** — see [Testing](#testing) below.

8. **Add documentation** in `docs/guides/en/my-module.md`.

## Using the Plugin System

For third-party extensions, prefer implementing the `BootPlugin` interface over modifying framework internals. Plugins let you add modules without touching `create-app.ts`:

```ts
import { BootPlugin } from 'nestjs-boot';
import Joi from 'joi';

export const myPlugin: BootPlugin = {
  name: 'my-plugin',
  configKey: 'myPlugin',

  // Optional: Joi schema merged into boot options validation
  configSchema: Joi.object({
    apiKey: Joi.string().required(),
  }),

  // Return a DynamicModule — called when options.myPlugin is truthy
  register(options) {
    return MyPluginModule.register(options);
  },

  // Optional: apply global pipes/interceptors/filters after app creation
  applyGlobals(app) {
    app.useGlobalInterceptors(new MyInterceptor());
  },
};
```

The plugin is activated when its `configKey` is present in the boot options:

```ts
const app = await createApp(AppModule, {
  myPlugin: { apiKey: '...' },
}, { plugins: [myPlugin] });
```

## Code Style

- **TypeScript strict mode** — `strict: true` in tsconfig, no exceptions.
- **No `any`** — use generics (`T extends Document`), `unknown`, or specific types. `as any` is not accepted in PRs.
- **JSDoc on public APIs** — every exported function, class, and interface must have a JSDoc comment.
- **Barrel `index.ts` per module** — each `src/<module>/` directory must have an `index.ts` that re-exports the public API. Internal files should not be imported directly by consumers.
- **Naming:**
  - Files: `kebab-case` (e.g., `cache-stampede.guard.ts`)
  - Classes: `PascalCase` (e.g., `CacheStampedeGuard`)
  - Interfaces: `PascalCase`, with `I` prefix for repository contracts (e.g., `IRepository<T>`)
  - Constants: `UPPER_SNAKE_CASE`

## Testing

- **Framework:** [Vitest](https://vitest.dev/)
- **Run all tests:** `npx vitest run`
- **Run a specific file:** `npx vitest run tests/my-module.spec.ts`
- **Watch mode:** `npx vitest`

### Conventions

- Test files use `*.spec.ts` extension.
- MongoDB tests use `MongoMemoryServer` — no external instance required.
- Prisma tests use mocks (no real PostgreSQL connection in CI).
- Use the framework's own test utilities: `createTestSuite()`, `createFactory()`, `createTestClient()`.
- Name test suites after the class or feature being tested.

### Example

```ts
import { describe, it, expect } from 'vitest';
import { createTestSuite } from '../src/testing';

describe('MyService', () => {
  const suite = createTestSuite({ imports: [MyModule] });

  it('should do something', async () => {
    const app = await suite.compile();
    const service = app.get(MyService);
    expect(service.doSomething()).toBe(true);
    await suite.teardown();
  });
});
```

## Documentation

- **User guides:** `docs/guides/en/` — usage, config, examples, and pitfalls.
- **API reference:** `docs/api/` — endpoint and class documentation.
- **Teaching materials:** `docs/teaching/` — step-by-step tutorials.

Every new module or significant feature should have a corresponding guide in `docs/guides/en/`.

## Commit Convention

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(cache): add tag-based cache invalidation
fix(auth): prevent JWT refresh token reuse after rotation
docs(database): add Prisma guide with migration workflow
test(cqrs): add event store snapshot tests
chore(deps): update @nestjs/common to 10.4
```

Reference issues when applicable: `feat(auth): add TOTP 2FA support (#42)`.

## PR Process

1. **Fork** the repository and clone your fork.
2. **Create a feature branch** from `master`: `git checkout -b feat/my-feature`.
3. **Make your changes** following the code style guidelines above.
4. **Write or update tests** — all new code must have test coverage.
5. **Run the full test suite:** `npx vitest run` — all tests must pass.
6. **Run the build:** `npm run build` — must complete without errors.
7. **Update documentation** if your change affects the public API or config options.
8. **Open a PR** with a clear title and description of what changed and why.

### PR Checklist

- [ ] No `as any` in new code
- [ ] JSDoc on all public exports
- [ ] Tests pass (`npx vitest run`)
- [ ] Build succeeds (`npm run build`)
- [ ] Barrel `index.ts` updated if new exports added
- [ ] Documentation updated (if applicable)
- [ ] Conventional commit message

## Reporting Bugs

1. Search [existing issues](https://github.com/nthanhdo/nestjs-boot/issues) first.
2. If none found, open a new issue with:
   - A clear, descriptive title
   - Steps to reproduce
   - Expected vs. actual behavior
   - NestJS and nestjs-boot versions
   - Relevant code snippet or minimal reproduction

## Suggesting Enhancements

Open an issue with the `enhancement` label. Describe the use case, not just the feature.

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](https://www.contributor-covenant.org/version/2/1/code_of_conduct/). By participating, you are expected to uphold this code.

## Questions?

Open an [issue](https://github.com/nthanhdo/nestjs-boot/issues) or tag `@nthanhdo` in an existing one.
