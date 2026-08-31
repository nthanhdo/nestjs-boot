# Database API Reference

> Config-driven multi-connection MongoDB with reader/writer split, generic repository, cache-aside overlay, Specification pattern, Unit of Work, and migration system.

## Module Registration

### `DatabaseModule.register(options): DynamicModule`

Registers writer (and optionally reader) Mongoose connections. Registered globally — all modules can inject connections without re-importing.

```ts
DatabaseModule.register({
  connections: {
    master: {
      writerUri: 'mongodb://writer-host/mydb',
      readerUri: 'mongodb://reader-host/mydb',   // optional
    },
    analytics: {
      writerUri: 'mongodb://analytics-host/analyticsdb',
    },
  },
})
```

### `DatabaseModule.forFeature(connectionName, schemas): DynamicModule`

Registers Mongoose schemas on a named connection. Automatically registers on both writer and reader connections when a reader exists.

```ts
DatabaseModule.forFeature('master', [
  { name: Product.name, schema: ProductSchema },
  { name: Order.name,   schema: OrderSchema,   collection: 'orders' },
])
```

Throws `Error` if `connectionName` was not registered via `DatabaseModule.register()`.

### Options

#### `DatabaseOptions`

```ts
interface DatabaseOptions {
  connections: Record<string, {
    writerUri: string;
    readerUri?: string;
  }>;
}
```

#### `ModelDefinition`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | `string` | Yes | Model name (e.g., `Product.name`) |
| `schema` | `mongoose.Schema` | Yes | Mongoose schema |
| `collection` | `string` | No | Override collection name |
| `discriminators` | `Array<{ name: string; schema: mongoose.Schema }>` | No | Discriminator definitions |

---

## Classes

### `BaseRepository<T extends Document>`

Generic read/write repository with reader/writer split. All read operations route to the reader model (falls back to writer if no reader is configured). All write operations always use the writer model.

```ts
class ProductRepository extends BaseRepository<ProductDocument> {
  constructor(
    @InjectModel(Product.name, getWriterConnectionName('master'))
    writerModel: Model<ProductDocument>,
    @InjectModel(Product.name, getReaderConnectionName('master'))
    readerModel: Model<ProductDocument>,
  ) {
    super(writerModel, readerModel);
  }
}
```

#### Methods

##### `async findAll(filter?, options?): Promise<PaginatedResult<T>>`

Find all documents matching filter with pagination.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `filter` | `FilterQuery<T>` | `{}` | Mongoose filter |
| `options.page` | `number` | `1` | 1-based page number |
| `options.limit` | `number` | `20` | Documents per page |
| `options.sort` | `Record<string, 1 \| -1>` | — | Sort specification |
| `options.select` | `string \| Record<string, 1 \| 0>` | — | Field projection |

Returns `PaginatedResult<T>`:

| Field | Type |
|-------|------|
| `data` | `T[]` |
| `total` | `number` |
| `page` | `number` |
| `limit` | `number` |

##### `async findById(id: string): Promise<T | null>`

Find a document by its `_id`.

##### `async findOne(filter: FilterQuery<T>): Promise<T | null>`

Find the first document matching filter.

##### `async create(data: Partial<T>): Promise<T>`

Create and save a new document.

##### `async createMany(data: Partial<T>[]): Promise<T[]>`

Insert multiple documents.

##### `async update(id: string, data: Partial<T>): Promise<T | null>`

Update a document by ID (`findByIdAndUpdate` with `{ new: true }`).

##### `async updateMany(filter: FilterQuery<T>, data: Partial<T>): Promise<{ modifiedCount: number }>`

Update all documents matching filter.

##### `async delete(id: string): Promise<T | null>`

Delete a document by ID.

##### `async deleteMany(filter: FilterQuery<T>): Promise<{ deletedCount: number }>`

Delete all documents matching filter.

##### `async count(filter?): Promise<number>`

Count documents matching filter (uses reader model).

##### `async aggregate(pipeline: PipelineStage[]): Promise<unknown[]>`

Run an aggregation pipeline (uses reader model).

##### `async exists(filter: FilterQuery<T>): Promise<boolean>`

Check whether at least one document matches filter. Returns `true` / `false`.

---

### `CachedBaseRepository<T extends Document>`

Extends `BaseRepository` with automatic cache-aside using `MultiCacheService`. Read methods check cache first (MD5-keyed by collection + method + args). Write methods invalidate the entire collection's cache prefix.

```ts
class ProductRepository extends CachedBaseRepository<ProductDocument> {
  constructor(
    @InjectModel(Product.name, getWriterConnectionName('master'))
    writerModel: Model<ProductDocument>,
    @InjectModel(Product.name, getReaderConnectionName('master'))
    readerModel: Model<ProductDocument>,
    cacheService: MultiCacheService,
  ) {
    super(writerModel, readerModel, cacheService, 300); // 300s TTL
  }
}
```

#### Constructor

```ts
constructor(
  writerModel: Model<T>,
  readerModel: Model<T> | undefined,
  cacheService: MultiCacheService,
  cacheTtl: number = 300,   // seconds
)
```

Inherits all `BaseRepository` methods. Read overrides (`findAll`, `findById`, `findOne`, `count`, `aggregate`, `exists`) are cache-first. Write overrides (`create`, `createMany`, `update`, `updateMany`, `delete`, `deleteMany`) call through then invalidate by collection prefix via `cacheService.delByPrefix`.

Cache keys are MD5 hashes of `JSON.stringify([args])` namespaced under the MongoDB collection name.

---

### `UnitOfWork`

Wraps multiple repository operations in a single MongoDB session/transaction. Requires MongoDB replica set (standalone MongoDB does not support multi-document transactions).

```ts
const result = await this.unitOfWork.execute(async (session) => {
  const order    = await this.orderRepo.create(data, { session });
  await this.inventoryRepo.decrement(productId, qty, { session });
  await this.paymentRepo.charge(userId, total, { session });
  return order;
});
// All succeed or all rollback
```

#### Constructor

Injected automatically — requires `UNIT_OF_WORK_CONNECTION` token to be provided with a Mongoose `Connection`.

#### Methods

##### `async execute<T>(fn: (session: ClientSession) => Promise<T>): Promise<T>`

Runs `fn` inside a MongoDB transaction. Commits on success, aborts on error, always ends the session.

---

### `Specification<T>`

Abstract base for composable Mongoose query filters. Compose with `and`, `or`, `not` operators.

```ts
class IsActiveSpec extends Specification<Product> {
  toFilter() { return { isActive: true }; }
}

class InCategorySpec extends Specification<Product> {
  constructor(private category: string) { super(); }
  toFilter() { return { category: this.category }; }
}

const filter = new IsActiveSpec().and(new InCategorySpec('electronics')).toFilter();
const results = await repo.findAll(filter);
```

#### Methods

##### `abstract toFilter(): FilterQuery<T>`

Implement in subclass to return the Mongoose filter object.

##### `and(other: Specification<T>): Specification<T>`

Returns a new `AndSpecification` combining `this` and `other` with `$and`.

##### `or(other: Specification<T>): Specification<T>`

Returns a new `OrSpecification` combining `this` and `other` with `$or`.

##### `not(): Specification<T>`

Returns a new `NotSpecification` negating `this` with `$nor`.

---

### `MigrationRunner`

Executes pending migrations and tracks applied ones in the `_migrations` collection.

```ts
const runner = new MigrationRunner(connection, [myMigration]);
await runner.migrate();
```

#### Constructor

```ts
constructor(connection: mongoose.Connection, migrations: Migration[])
```

#### Methods

##### `async migrate(): Promise<MigrationResult[]>`

Run all pending migrations in ascending version order. Already-applied versions are skipped. Stops on first failure (later migrations may depend on prior ones).

##### `async rollback(count?: number): Promise<MigrationResult[]>`

Roll back the last `count` applied migrations (default: `1`), in reverse order. Skips migrations without a `down()` method.

##### `async status(): Promise<MigrationStatus[]>`

Return the status of all registered migrations, comparing registered versions against the `_migrations` collection.

---

## Module: `MigrationModule`

```ts
MigrationModule.register({
  connection: 'master',           // DatabaseModule connection name
  migrations: [myMigration],     // Migration instances to register
  autoRun: false,                 // Auto-run on app start (default: false)
})
```

Exports token `'MIGRATION_RUNNER'` (a `MigrationRunner` instance).

With `autoRun: true`, pending migrations run during `onModuleInit`. Explicit CLI invocation is safer for production.

---

## Decorators

### `@InjectConnection(connectionName, type?)`

Inject a raw Mongoose connection by name and type.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `connectionName` | `string` | — | Connection name from `DatabaseModule.register` config |
| `type` | `'writer' \| 'reader'` | `'writer'` | Which connection to inject |

```ts
constructor(
  @InjectConnection('master', 'writer') private writerConn: Connection,
  @InjectConnection('master', 'reader') private readerConn: Connection,
) {}
```

For model injection, use `@nestjs/mongoose`'s `@InjectModel` with the connection name from `getWriterConnectionName` / `getReaderConnectionName`.

---

## Interfaces

### `Migration`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `version` | `string` | Yes | Unique version string — determines sort order. Use `'2026-08-07-001'` or `'1.0.0'` |
| `name` | `string` | Yes | Human-readable name (`'add-email-index'`) |
| `up` | `(db: mongoose.Connection) => Promise<void>` | Yes | Apply migration |
| `down` | `(db: mongoose.Connection) => Promise<void>` | No | Rollback migration |

### `MigrationResult`

| Field | Type | Description |
|-------|------|-------------|
| `version` | `string` | Migration version |
| `name` | `string` | Migration name |
| `status` | `'applied' \| 'rolled_back' \| 'skipped' \| 'failed'` | Execution result |
| `durationMs` | `number` | Elapsed time |
| `error` | `string \| undefined` | Error message on failure |

### `MigrationStatus`

| Field | Type | Description |
|-------|------|-------------|
| `version` | `string` | Migration version |
| `name` | `string` | Migration name |
| `appliedAt` | `Date \| null` | When applied, or `null` if pending |
| `pending` | `boolean` | Whether migration has not yet been applied |

---

## Constants / Tokens

| Token | Value | Description |
|-------|-------|-------------|
| `DATABASE_CONNECTION_PREFIX` | `'BOOT_DB_'` | Prefix for all connection injection tokens |
| `UNIT_OF_WORK_CONNECTION` | `'BOOT_UNIT_OF_WORK_CONNECTION'` | Injection token for `UnitOfWork` connection |

### Token Helper Functions

| Function | Returns | Example |
|----------|---------|---------|
| `getWriterToken(name)` | `string` | `getWriterToken('master')` → `'BOOT_DB_MASTER_WRITER'` |
| `getReaderToken(name)` | `string` | `getReaderToken('master')` → `'BOOT_DB_MASTER_READER'` |
| `getWriterConnectionName(name)` | `string` | `getWriterConnectionName('master')` → `'master_writer'` |
| `getReaderConnectionName(name)` | `string` | `getReaderConnectionName('master')` → `'master_reader'` |

Use `getWriterConnectionName` / `getReaderConnectionName` as the connection name argument to `@nestjs/mongoose`'s `@InjectModel`.
