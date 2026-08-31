# Contracts API Reference

> Interface-based dependency injection tokens that break circular module dependencies.

## Overview

The Contracts system lets you define typed injection tokens from a shared file that imports nothing from other modules. Consuming modules depend on the contract (a symbol + phantom type), not the implementing module — eliminating circular imports.

```ts
// shared/contracts.ts  — no module imports
export const IUserLookup = createContract<{
  findById(id: string): Promise<User>;
  findByEmail(email: string): Promise<User | null>;
}>('IUserLookup');

// order.service.ts — depends on contract, not UserModule
constructor(
  @InjectContract(IUserLookup) private user: ContractType<typeof IUserLookup>,
) {}

// user.module.ts — binds implementation
providers: [UserService, provideContract(IUserLookup, UserService)]
exports: [IUserLookup.token]
```

---

## Functions

### `createContract<T>(name): Contract<T>`

Creates a typed injection token for an interface.

| Parameter | Type | Description |
|-----------|------|-------------|
| `name` | `string` | Human-readable name, used in warnings and `contract.name` |

Returns a `Contract<T>` object with a unique `Symbol` token and phantom type for inference.

---

### `provideContract<T>(contract, implementation): Provider`

Creates a NestJS provider that binds a contract to an existing class via `useExisting`.

| Parameter | Type | Description |
|-----------|------|-------------|
| `contract` | `Contract<T>` | The contract created by `createContract` |
| `implementation` | `Type<T>` | The class that implements the contract interface |

```ts
// In module providers array:
provideContract(IUserLookup, UserService)
// Equivalent to: { provide: IUserLookup.token, useExisting: UserService }
```

---

### `provideContractFactory<T>(contract, factory, inject?): Provider`

Creates a NestJS provider that binds a contract to a factory function via `useFactory`.

| Parameter | Type | Description |
|-----------|------|-------------|
| `contract` | `Contract<T>` | The contract token |
| `factory` | `(...args: any[]) => T` | Factory function producing the implementation |
| `inject` | `any[]` (optional) | Tokens to inject into the factory |

---

### `validateContracts(app, contracts): void`

Validates that every contract in the list has a provider bound in the app. Call in dev mode after `NestFactory.create()` for early detection of missing bindings. Logs a warning (does not throw) for each unbound contract.

| Parameter | Type | Description |
|-----------|------|-------------|
| `app` | `INestApplication` | The NestJS application instance |
| `contracts` | `Contract<any>[]` | Contracts to check |

```ts
const app = await NestFactory.create(AppModule);
validateContracts(app, [IUserLookup, IOrderService]);
```

---

## Decorators

### `@InjectContract(contract)`

Parameter decorator — injects the value bound to a contract token.

| Parameter | Type | Description |
|-----------|------|-------------|
| `contract` | `Contract<T>` | The contract to inject |

```ts
constructor(
  @InjectContract(IUserLookup) private user: ContractType<typeof IUserLookup>,
) {}
```

Delegates to NestJS `@Inject(contract.token)`.

---

## Interfaces

### `Contract<T>`

| Property | Type | Description |
|----------|------|-------------|
| `token` | `symbol` | Unique injection token (use in `exports` array) |
| `name` | `string` | Human-readable name for logging |
| `_type` | `T` | Phantom property — never accessed at runtime, only for TypeScript inference |

### `ContractType<C>`

Utility type that extracts the interface type `T` from a `Contract<T>`.

```ts
type UserLookup = ContractType<typeof IUserLookup>;
// equivalent to: { findById(id: string): Promise<User>; ... }
```
