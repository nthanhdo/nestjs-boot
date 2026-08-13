# Deploy Hooks

> **TL;DR** — `DeployHooksModule` provides a phased lifecycle for deploy-time checks: environment validation, dependency connectivity, database migrations, and readiness gating. Register hooks via config or the `@OnDeploy` decorator.

## Setup

```ts
import { DeployHooksModule } from 'nestjs-boot/deploy';

@Module({
  imports: [
    DeployHooksModule.register({
      enabled: true,
      requiredEnvVars: ['DATABASE_URL', 'REDIS_URL', 'JWT_SECRET'],
      dependencyCheck: true,
      readinessDelay: 2000,
    }),
  ],
})
export class AppModule {}
```

The module registers globally and uses NestJS `DiscoveryService` to scan for `@OnDeploy` decorated methods at startup.

## Deploy Phases

Hooks execute in a strict phase order. Each phase runs its hooks sequentially, sorted by `order` (ascending).

```
preStart → preMigrate → postMigrate → postStart → healthGate
```

| Phase | Purpose | Typical Hooks |
|-------|---------|---------------|
| `preStart` | Validate environment and connectivity before anything starts | EnvValidation, DependencyCheck |
| `preMigrate` | Pre-migration preparation (backups, locks) | Custom backup hooks |
| `postMigrate` | Post-migration verification (schema checks) | Custom schema validators |
| `postStart` | App is running but not yet declared ready | Cache warming, seed data |
| `healthGate` | Poll health endpoint until healthy, then signal readiness | ReadinessGate |

If any hook throws, the phase fails and subsequent phases do not execute.

## Built-in Hooks

### EnvValidationHook

Validates required environment variables before boot. Runs first in `preStart` (order: -100).

```ts
import { EnvValidationHook } from 'nestjs-boot/deploy';

// Registered automatically when requiredEnvVars is set in DeployOptions
// Or register manually:
deployService.registerHook(
  new EnvValidationHook(['DATABASE_URL', 'REDIS_URL', 'API_KEY']),
);
```

Throws with a list of missing variables if any are undefined.

### DependencyCheckHook

Tests connectivity to MongoDB and Redis before boot. Runs in `preStart` (order: -50).

```ts
import { DependencyCheckHook } from 'nestjs-boot/deploy';

deployService.registerHook(new DependencyCheckHook());
```

- **MongoDB**: Creates a test connection to each configured `database.connections[name].writerUri`, then closes it.
- **Redis**: Connects to `cache.redis.url`, sends PING, then quits.
- Skips checks for services not configured in `BootOptions`.

### ReadinessGateHook

Polls the app health endpoint until it returns 2xx, then marks the service as ready. Runs in `healthGate` phase.

```ts
import { ReadinessGateHook } from 'nestjs-boot/deploy';

deployService.registerHook(
  new ReadinessGateHook({
    maxAttempts: 30,    // default: 30
    intervalMs: 1000,   // default: 1000
    delayMs: 2000,      // wait before first check (default: 0)
  }),
);
```

Uses the health path from `BootOptions` (default: `/health`). Throws after `maxAttempts` failed checks.

## @OnDeploy Decorator

Mark any injectable method as a deploy hook:

```ts
import { OnDeploy } from 'nestjs-boot/deploy';

@Injectable()
export class MigrationService {
  @OnDeploy('preMigrate', 10)  // phase, order
  async backupDatabase(ctx: DeployContext): Promise<void> {
    ctx.logger.log(`Backing up database for ${ctx.environment}...`);
    await this.backupService.createSnapshot();
  }

  @OnDeploy('postMigrate', 0)
  async verifySchema(ctx: DeployContext): Promise<void> {
    ctx.logger.log('Verifying schema integrity...');
    await this.schemaValidator.check();
  }
}
```

The `DeployHookScanner` discovers these at module init using NestJS `DiscoveryService` and registers them with `DeployService`. Hook name format: `ClassName.methodName`.

## DeployContext

Every hook receives a `DeployContext`:

```ts
interface DeployContext {
  phase: DeployPhase;      // current phase
  environment: string;     // e.g. 'production', 'staging'
  version: string;         // app version
  startTime: Date;         // when the deploy started
  logger: Logger;          // NestJS Logger instance
  config: BootOptions;     // full app configuration
}
```

Use `ctx.logger` for structured logging — output includes hook name and timing automatically.

## Custom Deploy Hooks

Implement the `DeployHook` interface and register with `DeployService`:

```ts
import { DeployHook, DeployContext } from 'nestjs-boot/deploy';

export class CacheWarmupHook implements DeployHook {
  readonly name = 'CacheWarmup';
  readonly phase = 'postStart' as const;
  readonly order = 10;

  async execute(context: DeployContext): Promise<void> {
    context.logger.log('Warming cache...');
    // Pre-load frequently accessed data
    await this.cacheService.warmup();
    context.logger.log('Cache warmed');
  }
}

// Register programmatically
deployService.registerHook(new CacheWarmupHook());
```

## Executing Phases

`DeployService` exposes `executePhase()` for programmatic control:

```ts
const context: DeployContext = {
  phase: 'preStart',
  environment: process.env.NODE_ENV ?? 'production',
  version: process.env.APP_VERSION ?? '0.0.0',
  startTime: new Date(),
  logger: new Logger('Deploy'),
  config: bootOptions,
};

await deployService.executePhase('preStart', context);
await deployService.executePhase('preMigrate', context);
await deployService.executePhase('postMigrate', context);
await deployService.executePhase('postStart', context);
await deployService.executePhase('healthGate', context);
```

Each phase logs the number of hooks, individual timings, and total duration.

## Integration with K8s Rolling Deploys

Use the `healthGate` phase to integrate with Kubernetes readiness probes:

```yaml
# k8s deployment
spec:
  containers:
    - name: app
      readinessProbe:
        httpGet:
          path: /health
          port: 3000
        initialDelaySeconds: 5
        periodSeconds: 3
```

```ts
DeployHooksModule.register({
  requiredEnvVars: ['DATABASE_URL'],
  dependencyCheck: true,
}),
```

Flow:
1. Pod starts → `preStart` validates env + connectivity
2. Migrations run (if configured) → `preMigrate` / `postMigrate`
3. App binds port → `postStart` warms caches
4. `healthGate` polls `/health` → returns 200 → K8s marks pod Ready
5. K8s routes traffic to the new pod, drains old pods

If any phase fails, the process exits non-zero and K8s does not route traffic.

## Configuration Reference

### DeployOptions

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | `boolean` | `true` | Enable/disable the module |
| `requiredEnvVars` | `string[]` | `[]` | Env vars to validate in preStart |
| `dependencyCheck` | `boolean` | `false` | Enable MongoDB/Redis connectivity check |
| `readinessDelay` | `number` | `0` | Delay in ms before health gate polling |
| `hooks` | `DeployHook[]` | `[]` | Additional hooks to register |

### DeployHook Interface

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `name` | `string` | Yes | Hook identifier (used in logs) |
| `phase` | `DeployPhase` | Yes | Which phase to run in |
| `order` | `number` | No | Execution order within phase (default: 0) |
| `execute` | `(ctx: DeployContext) => Promise<void>` | Yes | Hook logic |

## See Also

- [Health & Shutdown](health-shutdown.md) — health endpoint used by ReadinessGateHook
- [Configuration](configuration.md) — BootOptions structure
- [Production Checklist](production-checklist.md) — deploy verification steps
