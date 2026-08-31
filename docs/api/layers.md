# Layers API Reference

> Compile-time module layer enforcement — validates import direction at boot and prevents upward dependencies across CORE → INFRASTRUCTURE → DOMAIN → APPLICATION.

## Module Registration

`LayersModule` is not a standalone NestJS module. Layer enforcement is triggered by calling `validateLayers()` after `NestFactory.create()`.

```ts
import { validateLayers } from 'nestjs-boot';

const app = await NestFactory.create(AppModule);
validateLayers(app, { strict: true });
await app.listen(3000);
```

Via `BootOptions`:

```ts
createApp(AppModule, {
  layers: { enabled: true, strict: true },
});
```

## Functions

### `validateLayers(app, options?)`

Validates all module import directions after the NestJS application boots. Logs a warning for each violation; throws in strict mode.

```ts
function validateLayers(
  app: INestApplication,
  options?: LayerOptions,
): LayerValidationResult
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `app` | `INestApplication` | The booted NestJS application instance |
| `options` | `LayerOptions` | Optional configuration (see Interfaces) |

**Returns:** `LayerValidationResult` — `{ valid: boolean; violations: LayerViolation[] }`

**Behavior:**
- nestjs-boot's own core modules (`DatabaseModule`, `CacheModule`, `MetricsModule`, etc.) are automatically assigned `ModuleLayer.CORE`.
- Modules decorated with `@Layer(...)` use their declared layer.
- All other modules default to `ModuleLayer.DOMAIN`.
- A violation occurs when a lower-level module imports a higher-level module (e.g., CORE importing DOMAIN).

## Decorators

### `@Layer(layer)`

Assigns a layer to a NestJS module. Used by `validateLayers()` to classify the module.

```ts
function Layer(layer: ModuleLayer): ClassDecorator
```

```ts
import { Layer, ModuleLayer } from 'nestjs-boot';

@Layer(ModuleLayer.DOMAIN)
@Module({ imports: [DatabaseModule], providers: [OrderService] })
export class OrderModule {}
```

**Metadata key:** `'boot:module:layer'` (exported as `LAYER_KEY`)

## Interfaces

### `LayerOptions`

```ts
interface LayerOptions {
  /** Enable layer validation (default: false — opt-in) */
  enabled?: boolean;
  /** Throw on violation instead of warning (default: false) */
  strict?: boolean;
  /** Custom rules for exceptions and extended layers */
  customRules?: {
    /** Allow specific cross-layer imports that would otherwise violate */
    allow?: Array<{ from: string; to: string }>;
    /** Define custom layers beyond the 4 defaults (name → numeric level) */
    layers?: Record<string, number>;
  };
}
```

### `LayerViolation`

```ts
interface LayerViolation {
  module: string;
  moduleLayer: ModuleLayer;
  importedModule: string;
  importedLayer: ModuleLayer;
  message: string;
}
```

### `LayerValidationResult`

```ts
interface LayerValidationResult {
  valid: boolean;
  violations: LayerViolation[];
}
```

## Constants / Tokens

| Export | Value | Description |
|--------|-------|-------------|
| `LAYER_KEY` | `'boot:module:layer'` | Reflect metadata key written by `@Layer()` |

## Enum: `ModuleLayer`

```ts
enum ModuleLayer {
  CORE           = 0,   // nestjs-boot infrastructure (auto-assigned)
  INFRASTRUCTURE = 1,   // adapters, gateways, third-party wrappers
  DOMAIN         = 2,   // business logic (default for user modules)
  APPLICATION    = 3,   // use-cases, controllers, resolvers
}
```

Higher numeric value = higher layer. A module at layer `N` may NOT import from layer `> N`.

### Built-in CORE modules (auto-classified, no decorator needed)

`BootConfigModule`, `DatabaseModule`, `CacheModule`, `HealthModule`, `AuthModule`, `CorrelationModule`, `ShutdownModule`, `TransportModule`, `InterServiceAuthModule`, `RpcModule`, `MetricsModule`, `LoggingModule`, `TracingModule`, `QueueModule`, `EventBusModule`, `BootWrappedModule`
