# DI API Reference

> Dependency-injection diagnostics: startup profiling, circular-dependency warnings, and DI error formatting.

---

## Classes

### `StartupProfiler`

Measures time spent in each bootstrap phase. Active only when `NODE_ENV !== 'production'` (unless overridden in the constructor).

```ts
import { StartupProfiler } from 'nestjs-boot/di';
```

#### Constructor

##### `new StartupProfiler(enabled?: boolean)`

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `enabled` | `boolean` | `process.env.NODE_ENV !== 'production'` | Explicitly enable or disable profiling. |

#### Methods

##### `startPhase(phase: string): void`

Start timing a named phase. If another phase is already active it is automatically ended first.

##### `endPhase(): void`

End the current phase and record its duration. No-op if no phase is active or the profiler is disabled.

##### `log(): void`

Print all recorded phases and the cumulative total to `console.log`. Ends any open phase before printing.

**Output format:**
```
[boot] Config validation: 12ms
[boot] NestFactory.create: 340ms
[boot] Total: 352ms
```

##### `getResults(): ReadonlyArray<PhaseResult>`

Return all recorded phase results without side-effects.

##### `getTotalMs(): number`

Return total elapsed milliseconds since the profiler was instantiated.

##### `isEnabled(): boolean`

Return `true` if the profiler is active.

---

## Functions

### `createNoOpProfiler(): StartupProfiler`

Create a `StartupProfiler` with `enabled = false`. All methods are no-ops. Use this in production bootstrap paths to avoid any overhead.

```ts
const profiler = process.env.NODE_ENV === 'production'
  ? createNoOpProfiler()
  : new StartupProfiler();
```

---

### `scanForCircularDepWarnings(app: INestApplication): void`

Walk the live NestJS module graph after `NestFactory.create()` succeeds and emit `warn`-level log messages for:

1. **Mutual imports** — Module A imports Module B and B imports A.
2. **God-module smell** — a module that imports more than 10 other modules.

Non-blocking and dev-mode only. Silently skips if the internal container is not accessible.

```ts
const app = await NestFactory.create(AppModule);
scanForCircularDepWarnings(app);
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `app` | `INestApplication` | The bootstrapped NestJS application instance. |

---

### `parseDiError(error: Error): DiErrorInfo | null`

Parse a NestJS DI error message and return structured information with fix suggestions. Returns `null` for unrecognised errors.

| Parameter | Type | Description |
|-----------|------|-------------|
| `error` | `Error` | The caught error from `NestFactory.create()`. |

**Returns:** [`DiErrorInfo`](#dierrorinfo) or `null`.

---

### `formatDiError(info: DiErrorInfo): string`

Format a `DiErrorInfo` as a human-readable, box-bordered string with actionable fix instructions.

| Parameter | Type | Description |
|-----------|------|-------------|
| `info` | `DiErrorInfo` | Parsed error info from `parseDiError()`. |

**Returns:** Multi-line string ready to pass to `console.error()`.

---

## Interfaces

### `PhaseResult`

```ts
interface PhaseResult {
  phase: string;      // Name of the phase
  durationMs: number; // Wall-clock duration in milliseconds
}
```

### `DiErrorInfo`

```ts
interface DiErrorInfo {
  type: 'circular' | 'unresolved' | 'unknown';
  modules: string[];       // Module names extracted from the error message
  providers: string[];     // Provider names extracted from the error message
  originalMessage: string; // Raw error message
  suggestion: string;      // Multi-line fix instructions
}
```
