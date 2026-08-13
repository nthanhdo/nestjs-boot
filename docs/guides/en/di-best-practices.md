# Dependency Injection Best Practices

## Barrel File Gotcha

NestJS resolves dependencies at module level. Barrel files (`index.ts`) that re-export from multiple modules can cause **unintended circular imports** because TypeScript resolves all exports eagerly.

**Problem:**
```ts
// shared/index.ts — re-exports everything
export * from './user.service';   // imports DatabaseModule
export * from './cache.service';  // imports CacheModule
export * from './auth.service';   // imports AuthModule → imports UserService → circular!
```

**Fix:** Import directly from the source file, not the barrel:
```ts
import { UserService } from '../shared/user.service';  // direct
import { UserService } from '../shared';                // barrel — risky
```

## SharedModule Pattern

When multiple feature modules need the same providers, create a `SharedModule`:

```ts
@Module({
  imports: [DatabaseModule, CacheModule],
  providers: [UserService, ProductService],
  exports: [UserService, ProductService],
})
export class SharedModule {}
```

Then import `SharedModule` in each feature module instead of duplicating providers.

**Key rule:** A `SharedModule` should only contain **stateless services** (no request-scoped providers, no controllers).

## forwardRef Warning

`forwardRef()` is a code smell. It means two modules depend on each other — a design issue.

```ts
// Works but fragile — avoid if possible
@Module({
  imports: [forwardRef(() => OrderModule)],
})
export class UserModule {}
```

**Better alternatives:**
1. **Extract shared logic** into a third module both can import
2. **Use events** — `UserModule` emits `UserCreated`, `OrderModule` listens
3. **Inject via interface** — define an abstract class/interface, bind in a parent module

`forwardRef` is acceptable for:
- Bidirectional entity relationships (Mongoose populate)
- Legacy code migration (temporary, document the plan to remove)

## How createApp() Avoids Circular Dependencies

`nestjs-boot`'s `createApp()` architecture prevents the most common circular dep patterns:

1. **Infrastructure modules are registered once, globally** — `DatabaseModule`, `CacheModule`, `AuthModule` etc. are `@Global()` and registered at the root. Feature modules import nothing from infrastructure — they just `@Inject()` what they need.

2. **No cross-module provider sharing** — each infrastructure module owns its providers. `CacheModule` provides `MultiCacheService`; `DatabaseModule` provides connections. They never import each other.

3. **Config is centralized** — `BootConfigModule` holds all config. No module needs to import another module just to read config.

4. **Guards and interceptors are global** — registered via `app.useGlobalInterceptors()` / `app.useGlobalFilters()` in `createApp()`, not via module imports. This eliminates guard-related circular deps entirely.

**If you still hit circular deps in your app code:**
```bash
# Enable NestJS debug output to see the resolution chain
NEST_DEBUG=true npm run start:dev
```

The debug output shows exactly which provider cannot be resolved and the full dependency chain.
