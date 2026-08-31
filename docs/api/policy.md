# Policy API Reference

> Resource-level authorization via named, composable policies. Policies are registered by name and evaluated against a rich `AuthorizationContext` built from the request.

## Module Registration

```ts
PolicyModule.register(options?: PolicyModuleOptions): DynamicModule
```

`PolicyModule` is `global: true`. Registers `PolicyRegistry`, `PolicyEngine`, and `PolicyGuard` as global providers. Register once in your root `AppModule`.

```ts
import { PolicyModule, AuthorizationPolicy, AuthorizationContext, AuthorizationResult } from '@nestjs-boot/policy';

class OwnerOnlyPolicy implements AuthorizationPolicy {
  readonly name = 'ownerOnly';

  async evaluate(ctx: AuthorizationContext): Promise<AuthorizationResult> {
    if (ctx.resourceId === ctx.user.id) {
      return { allowed: true, reason: 'User owns the resource' };
    }
    return { allowed: false, reason: 'Access restricted to resource owner' };
  }
}

PolicyModule.register({
  policies: [new OwnerOnlyPolicy()],
  denyByDefault: true,
})
```

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `policies` | `AuthorizationPolicy[]` | `[]` | Policies to register at module init |
| `buildContext` | `(req, metadata?) => AuthorizationContext \| Promise<AuthorizationContext>` | Reads `req.user` | Custom context builder. Receives the raw request and decorator metadata |
| `denyByDefault` | `boolean` | `true` | When `true`, an unregistered policy name results in a `403`. When `false`, unregistered policies allow access |

---

## Classes

### `PolicyEngine`

> Orchestrates context building, policy lookup, and evaluation.

Injectable via class token. Exported from `PolicyModule`.

#### Methods

##### `buildContext(request: any, metadata?: Record<string, any>): Promise<AuthorizationContext>`

Build an `AuthorizationContext` from the HTTP request. Uses `options.buildContext` if provided; otherwise extracts `user`, `roles`, `permissions`, `organizationId`, `departmentId`, `teamId` from `req.user`, and `resourceId` from `req.params.id`.

##### `evaluate(policyName: string, context: AuthorizationContext): Promise<AuthorizationResult>`

Look up a policy by name in the registry and evaluate it against the given context. If the policy is not registered, returns `{ allowed: false }` when `denyByDefault: true` (the default), or `{ allowed: true }` when `denyByDefault: false`. Catches and logs evaluation errors — always returns a safe result.

##### `evaluateAll(policyNames: string[], context: AuthorizationContext): Promise<AuthorizationResult>`

Evaluate multiple policies with AND logic — all must allow. Returns on the first denial.

```ts
const result = await engine.evaluateAll(['ownerOnly', 'withinOrg'], ctx);
if (!result.allowed) throw new ForbiddenException(result.reason);
```

---

### `PolicyRegistry`

> Manages named policy instances.

Injectable via class token. Exported from `PolicyModule`. Policies registered via `PolicyModuleOptions.policies` are added here at `onModuleInit`. You can also inject `PolicyRegistry` directly to register policies dynamically at runtime.

#### Methods

##### `register(policy: AuthorizationPolicy): void`

Register a policy by its `name`. Logs a warning if the name is already registered (overwrites).

##### `get(name: string): AuthorizationPolicy | undefined`

Return a policy by name, or `undefined` if not found.

##### `has(name: string): boolean`

Check whether a policy name is registered.

##### `getAll(): AuthorizationPolicy[]`

Return all registered policy instances.

##### `getNames(): string[]`

Return all registered policy names.

---

### `PolicyGuard`

> Route guard that invokes the named policy from `@CheckPolicy()`.

Registered globally via `APP_GUARD` when `PolicyModule.register()` is called. Respects `@Public()` routes. If no `@CheckPolicy()` is present on the handler or controller, the guard passes.

On denial: throws `ForbiddenException` with the `reason` from `AuthorizationResult`.

---

## Decorators

### `@CheckPolicy(policyName: string, metadata?: Record<string, any>)`

Attach to a controller method or controller class to enforce a named policy.

```ts
import { CheckPolicy } from '@nestjs-boot/policy';

@Controller('reports')
export class ReportController {
  @Get(':id')
  @CheckPolicy('ownerOnly')
  getOne(@Param('id') id: string) { ... }

  @Get('department/:id')
  @CheckPolicy('departmentAccess', { resource: 'report' })
  getDeptReport() { ... }
}
```

`metadata` is forwarded to `PolicyEngine.buildContext()` and available on `AuthorizationContext.metadata`. Use it to pass resource type, action name, or any extra data your policy needs.

---

## Interfaces

### `AuthorizationPolicy`

```ts
interface AuthorizationPolicy {
  readonly name: string;
  evaluate(context: AuthorizationContext): Promise<AuthorizationResult>;
}
```

Implement this interface to create custom policies. Register them via `PolicyModuleOptions.policies` or `PolicyRegistry.register()`.

### `AuthorizationContext`

```ts
interface AuthorizationContext {
  user: {
    id: string;
    roles?: string[];
    permissions?: string[];
    organizationId?: string;
    departmentId?: string;
    teamId?: string;
    [key: string]: any;
  };
  action: string;
  resource?: string;
  resourceId?: string;
  organizationId?: string;
  departmentId?: string;
  teamId?: string;
  metadata?: Record<string, any>;
}
```

### `AuthorizationResult`

```ts
interface AuthorizationResult {
  allowed: boolean;
  reason?: string;
  matchedPermission?: string;
  scope?: string;
  policy?: string;
}
```

`policy` is automatically set by `PolicyEngine.evaluate()`.

### `PolicyModuleOptions`

```ts
interface PolicyModuleOptions {
  policies?: AuthorizationPolicy[];
  buildContext?: (request: any, metadata?: Record<string, any>) => AuthorizationContext | Promise<AuthorizationContext>;
  denyByDefault?: boolean;
}
```

---

## Constants / Tokens

| Token | Value | Description |
|-------|-------|-------------|
| `POLICY_KEY` | `'boot:policy'` | Metadata key set by `@CheckPolicy()` |
| `POLICY_OPTIONS` | `'BOOT_POLICY_OPTIONS'` | Injection token for `PolicyModuleOptions` |
| `POLICY_REGISTRY` | `'BOOT_POLICY_REGISTRY'` | Injection token for `PolicyRegistry` (also injectable by class) |
