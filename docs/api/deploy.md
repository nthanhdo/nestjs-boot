# Deploy API Reference

> Deploy lifecycle hooks system — validate environment, check dependencies, and gate on health before traffic is accepted.

## Module Registration

```ts
DeployHooksModule.register(options?: DeployOptions)
```

Registers globally. Scans all providers for `@OnDeploy`-decorated methods and registers them automatically. Also provides `DeployService` for manual hook registration and phase execution.

```ts
DeployHooksModule.register({
  enabled: true,
  requiredEnvVars: ['DATABASE_URL', 'JWT_SECRET'],
  dependencyCheck: true,
  readinessDelay: 2000,
  hooks: [
    new EnvValidationHook(['DATABASE_URL']),
    new DependencyCheckHook(),
    new ReadinessGateHook({ maxAttempts: 30 }),
  ],
})
```

### Options (`DeployOptions`)

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | `boolean` | — | Enable the deploy hooks system |
| `requiredEnvVars` | `string[]` | — | Environment variables that must be present at startup |
| `dependencyCheck` | `boolean` | — | Enable connectivity checks for MongoDB and Redis |
| `readinessDelay` | `number` | — | Delay in ms before the `healthGate` phase begins polling |
| `hooks` | `DeployHook[]` | — | Programmatically provided hook instances (run in addition to decorator-discovered hooks) |

---

## Classes

### `DeployService`

Manages deploy hook registration and phase execution. Provided globally by `DeployHooksModule`.

#### Methods

##### `registerHook(hook: DeployHook): void`

Register a hook manually. Logs registration at `log` level.

| Parameter | Type | Description |
|-----------|------|-------------|
| `hook` | `DeployHook` | Hook definition with name, phase, optional order, and execute function |

##### `async executePhase(phase: DeployPhase, context: DeployContext): Promise<void>`

Execute all hooks registered for the given phase, sorted by `order` (ascending). Throws if any hook throws — subsequent hooks in the same phase are not run.

| Parameter | Type | Description |
|-----------|------|-------------|
| `phase` | `DeployPhase` | Phase to execute |
| `context` | `DeployContext` | Context passed to all hook `execute` functions |

##### `getHooks(): ReadonlyArray<DeployHook>`

Returns a read-only copy of all registered hooks (across all phases).

---

### `EnvValidationHook`

Built-in hook that validates required environment variables are set. Runs in `preStart` phase at `order: -100` (first).

```ts
new EnvValidationHook(['DATABASE_URL', 'JWT_SECRET', 'REDIS_URL'])
```

#### Constructor

```ts
constructor(requiredVars: string[])
```

Throws `Error` listing all missing variable names if any are absent from `process.env`.

---

### `DependencyCheckHook`

Built-in hook that verifies connectivity to external dependencies (MongoDB, Redis) before the application starts. Runs in `preStart` phase at `order: -50`.

Reads connection config from `context.config` (the `BootOptions`). Checks MongoDB for every connection defined in `config.database.connections`. Checks Redis if `config.cache.redis.url` is set.

Throws `Error` with the connection name and underlying error message on failure.

---

### `ReadinessGateHook`

Built-in hook that polls the application health endpoint until it returns a 2xx response, then signals readiness. Runs in `healthGate` phase at `order: 0`.

```ts
new ReadinessGateHook({
  maxAttempts: 30,    // default
  intervalMs: 1000,   // ms between attempts, default
  delayMs: 0,         // initial delay before polling, default
})
```

#### Constructor

```ts
constructor(options?: {
  maxAttempts?: number;   // default: 30
  intervalMs?: number;    // default: 1000
  delayMs?: number;       // default: 0
})
```

Reads the health path from `context.config.health.path` (falls back to `'/health'`). Uses the `PORT` environment variable (falls back to `3000`).

Throws `Error` after `maxAttempts` failed attempts.

---

### `DeployHookScanner`

Internal service that runs on `onModuleInit` and discovers all `@OnDeploy`-decorated methods across all NestJS providers via `DiscoveryService`. Registers them automatically with `DeployService`. Not intended for direct use.

---

## Decorators

### `@OnDeploy(phase, order?)`

Marks a method as a deploy lifecycle hook. The class must be a NestJS provider (decorated with `@Injectable()` and registered in a module). `DeployHookScanner` discovers and registers it automatically.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `phase` | `DeployPhase` | — | The deploy phase this hook runs in |
| `order` | `number` | `0` | Execution order within the phase (lower = earlier) |

```ts
@Injectable()
class AppStartupHooks {
  @OnDeploy('preStart', -10)
  async validateConfig(ctx: DeployContext): Promise<void> {
    ctx.logger.log(`Starting v${ctx.version} in ${ctx.environment}`);
    // throw to abort startup
  }

  @OnDeploy('postStart', 0)
  async registerWithRegistry(ctx: DeployContext): Promise<void> {
    // runs after NestJS app is fully initialized
  }
}
```

---

## Interfaces

### `DeployHook`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | `string` | Yes | Hook display name (used in logs) |
| `phase` | `DeployPhase` | Yes | Phase this hook runs in |
| `order` | `number` | No | Sort order within phase. Lower = earlier. Default: `0` |
| `execute` | `(context: DeployContext) => Promise<void>` | Yes | Hook implementation. Throw to abort the phase |

### `DeployContext`

Passed to every hook's `execute` method.

| Field | Type | Description |
|-------|------|-------------|
| `phase` | `DeployPhase` | Current phase being executed |
| `environment` | `string` | Value of `NODE_ENV` or equivalent |
| `version` | `string` | Application version |
| `startTime` | `Date` | When the deploy sequence began |
| `logger` | `Logger` | NestJS `Logger` instance for structured output |
| `config` | `BootOptions` | Full application boot options |

### `DeployOptions`

See [Module Registration](#module-registration) options table above.

---

## Constants / Tokens

| Name | Value | Description |
|------|-------|-------------|
| `DEPLOY_OPTIONS` | `'DEPLOY_OPTIONS'` | Injection token for `DeployOptions` |
| `DEPLOY_HOOK_METADATA` | `'DEPLOY_HOOK_METADATA'` | Reflect metadata key used by `@OnDeploy` |

---

## Types

### `DeployPhase`

```ts
type DeployPhase = 'preStart' | 'preMigrate' | 'postMigrate' | 'postStart' | 'healthGate';
```

### `DEPLOY_PHASE_ORDER`

The canonical phase execution order:

```ts
const DEPLOY_PHASE_ORDER: DeployPhase[] = [
  'preStart',      // env validation, dependency checks
  'preMigrate',    // any pre-migration setup
  'postMigrate',   // any post-migration cleanup
  'postStart',     // after NestJS app is fully initialized
  'healthGate',    // poll health endpoint before accepting traffic
];
```
