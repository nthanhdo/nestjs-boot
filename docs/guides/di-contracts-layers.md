# DI Contracts, Layers & Diagnostics — nestjs-boot

> Interface-based DI, architectural layer enforcement, module graph analysis, and DI error diagnostics.

---

## 1. Contract-Based Dependency Injection

Contracts let modules depend on interfaces instead of concrete implementations, eliminating circular imports.

### createContract — Define a Typed Token

```ts
// shared/contracts.ts (no module imports — just types)
import { createContract } from 'nestjs-boot';

export const IUserLookup = createContract<{
  findById(id: string): Promise<User>;
  findByEmail(email: string): Promise<User | null>;
}>('IUserLookup');

export const IOrderService = createContract<{
  getOrdersForUser(userId: string): Promise<Order[]>;
}>('IOrderService');
```

`createContract<T>(name)` returns a `Contract<T>` object with a unique `Symbol` token and phantom type for inference.

### @InjectContract — Consume a Contract

```ts
import { InjectContract } from 'nestjs-boot';
import { IUserLookup } from '../shared/contracts';
import type { ContractType } from 'nestjs-boot';

@Injectable()
export class OrderService {
  constructor(
    @InjectContract(IUserLookup)
    private readonly userLookup: ContractType<typeof IUserLookup>,
  ) {}

  async getOrder(userId: string) {
    const user = await this.userLookup.findById(userId);
    // OrderModule never imports UserModule
  }
}
```

### provideContract — Bind Implementation

```ts
import { provideContract, provideContractFactory } from 'nestjs-boot';
import { IUserLookup } from '../shared/contracts';

@Module({
  providers: [
    UserService,
    provideContract(IUserLookup, UserService),
    // equivalent to: { provide: IUserLookup.token, useExisting: UserService }
  ],
  exports: [IUserLookup.token],
})
export class UserModule {}
```

For factory-based binding:

```ts
provideContractFactory(IConfig, () => loadConfig(), [ConfigService])
// equivalent to: { provide: IConfig.token, useFactory: ..., inject: [...] }
```

### validateContracts — Dev-Mode Safety Net

Call after app creation to detect missing contract bindings early:

```ts
import { validateContracts } from 'nestjs-boot';

const app = await createApp(AppModule, options);
validateContracts(app, [IUserLookup, IOrderService]);
// Logs warning: 'Contract "IOrderService" has no provider...'
```

---

## 2. Architectural Layers

The `@Layer` decorator and `validateLayers` enforcer prevent upward imports (e.g., a CORE module importing a DOMAIN module).

### ModuleLayer Enum

```ts
enum ModuleLayer {
  CORE = 0,            // nestjs-boot internals (DatabaseModule, CacheModule, etc.)
  INFRASTRUCTURE = 1,  // adapters, external service clients
  DOMAIN = 2,          // business logic modules (default for undecorated modules)
  APPLICATION = 3,     // controllers, API surface, orchestration
}
```

Lower numbers = lower layer. A module may import from its own layer or below, never above.

### @Layer Decorator

```ts
import { Layer, ModuleLayer } from 'nestjs-boot';

@Layer(ModuleLayer.INFRASTRUCTURE)
@Module({
  providers: [StripeGateway, EmailAdapter],
  exports: [StripeGateway, EmailAdapter],
})
export class InfrastructureModule {}

@Layer(ModuleLayer.APPLICATION)
@Module({
  imports: [OrderModule, InfrastructureModule],  // OK: APPLICATION imports DOMAIN and INFRA
  controllers: [OrderController],
})
export class OrderApiModule {}
```

All nestjs-boot core modules (`DatabaseModule`, `CacheModule`, `AuthModule`, etc.) are automatically assigned `CORE`. Undecorated user modules default to `DOMAIN`.

### validateLayers — Import Direction Check

```ts
import { validateLayers } from 'nestjs-boot';

const app = await createApp(AppModule, options);

// Warn-only mode (default)
const result = validateLayers(app);
// result.valid === false if violations found
// result.violations = [{ module, moduleLayer, importedModule, importedLayer, message }]

// Strict mode — throws on violation
validateLayers(app, { strict: true });

// Allow specific exceptions
validateLayers(app, {
  customRules: {
    allow: [{ from: 'SharedModule', to: 'UserApiModule' }],
  },
});
```

---

## 3. Module Graph Analysis

Static analysis of `@Module({ imports })` metadata from source files. Works without booting the app.

### analyzeModules

```ts
import { analyzeModules } from 'nestjs-boot';

const result = analyzeModules('/path/to/project');
// result.modules  — ModuleNode[] (name, filePath, imports, exports, providers)
// result.edges    — { from, to }[] (import relationships)
// result.cycles   — string[][] (detected cycles via Tarjan's SCC)
// result.stats    — { totalModules, totalEdges, maxFanOut, maxFanIn, cycleCount }
```

Scans `src/` for `*.module.ts` files (falls back to `dist/*.module.js`).

### detectCycles

Standalone cycle detection using Tarjan's Strongly Connected Components algorithm:

```ts
import { detectCycles } from 'nestjs-boot';

const cycles = detectCycles(
  ['A', 'B', 'C', 'D'],
  [{ from: 'A', to: 'B' }, { from: 'B', to: 'C' }, { from: 'C', to: 'A' }],
);
// [['A', 'B', 'C']]
```

### renderMermaid / renderJson

```ts
import { renderMermaid, renderJson } from 'nestjs-boot';

const graph = analyzeModules('.');
console.log(renderMermaid(graph));
// graph TD
//     AppModule --> UserModule
//     AppModule --> OrderModule
//     style UserModule fill:#ef4444,stroke:#dc2626,color:#fff   (if in cycle)

console.log(renderJson(graph));  // JSON with modules, edges, cycles, stats
```

---

## 4. DI Error Diagnostics

### parseDiError / formatDiError

Parses cryptic NestJS DI errors into structured, actionable messages.

```ts
import { parseDiError, formatDiError } from 'nestjs-boot';

try {
  await createApp(AppModule, options);
} catch (error) {
  const info = parseDiError(error);
  if (info) {
    console.error(formatDiError(info));
    // ╔══════════════════════════════════════╗
    // ║  nestjs-boot: DI Error Detected      ║
    // ╚══════════════════════════════════════╝
    //
    // UNRESOLVED DEPENDENCY
    //   Modules involved: OrderModule
    //   Providers: UserService
    //
    //   FIX:
    //   Ensure UserService is provided and exported...
  }
}
```

Detected error types: `'circular'` (circular dependency) and `'unresolved'` (missing provider). Each includes affected module names, provider names, the original message, and a concrete fix suggestion.

### scanForCircularDepWarnings

Post-boot scanner that warns about mutual imports and god-modules (>10 imports). Dev-mode only, non-blocking.

```ts
import { scanForCircularDepWarnings } from 'nestjs-boot';

const app = await createApp(AppModule, options);
scanForCircularDepWarnings(app);
// [nestjs-boot:di] Mutual import detected: UserModule <-> OrderModule...
// [nestjs-boot:di] Module "AppModule" imports 14 modules. Consider splitting...
```

### StartupProfiler

Measures time spent in each `createApp` phase. Auto-enabled when `NODE_ENV !== 'production'`.

```ts
import { StartupProfiler } from 'nestjs-boot';

const profiler = new StartupProfiler();       // auto-enabled in dev
profiler.startPhase('Config validation');
// ... work ...
profiler.startPhase('NestFactory.create');     // auto-ends previous phase
// ... work ...
profiler.endPhase();
profiler.log();
// [boot] Config validation: 12ms
// [boot] NestFactory.create: 340ms
// [boot] Total: 352ms

const results = profiler.getResults();         // PhaseResult[]
const total = profiler.getTotalMs();
```

---

## 5. Best Practices

### Barrel File Gotcha

Barrel files (`index.ts`) that re-export from multiple modules cause eager resolution of all exports, which can trigger circular imports. Import directly from the source file:

```ts
import { UserService } from '../shared/user.service';  // safe
import { UserService } from '../shared';                // risky barrel
```

### SharedModule Pattern

Group stateless services into a `SharedModule` instead of duplicating providers:

```ts
@Module({
  imports: [DatabaseModule, CacheModule],
  providers: [UserService, ProductService],
  exports: [UserService, ProductService],
})
export class SharedModule {}
```

### forwardRef — Last Resort

`forwardRef()` is a code smell indicating two modules depend on each other. Prefer:

1. Extract shared logic into a third module
2. Use events (`EventBusModule`) for decoupling
3. Use contracts (`createContract`) for interface-based injection

### How createApp() Prevents Circular Deps

- Infrastructure modules are `@Global()` and registered once at root
- No cross-module provider sharing
- Config is centralized in `BootConfigModule`
- Guards and interceptors are global via `app.useGlobalInterceptors()`

Debug with: `NEST_DEBUG=true npm run start:dev`
