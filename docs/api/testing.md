# Testing API Reference

> Full integration testing toolkit: in-memory app bootstrap, HTTP/gRPC/microservice test clients, factories, snapshots, contract verification, and auth helpers.

## Integration

### `createTestApp`

```ts
async function createTestApp(
  AppModule: Type<unknown>,
  overrides?: CreateTestAppOptions,
): Promise<TestAppContext>
```

Create a test-ready NestJS application with in-memory infrastructure. Automatically replaces production dependencies:
- **MongoDB** → `mongodb-memory-server` (auto-start, auto-stop)
- **Cache** → disabled by default
- **Health** → disabled
- **Logging** → silent

```ts
let ctx: TestAppContext;

beforeAll(async () => {
  ctx = await createTestApp(AppModule);
});

afterAll(async () => {
  await ctx.cleanup();
});
```

With provider overrides:
```ts
ctx = await createTestApp(AppModule, {
  overrideProviders: [
    { provide: EmailService, useValue: { send: vi.fn() } },
  ],
  autoClean: true,
});
beforeEach(() => ctx.beforeEachClean());
afterAll(() => ctx.cleanup());
```

---

### `createTestSuite`

```ts
function createTestSuite(
  AppModule: Type<unknown>,
  options?: CreateTestAppOptions,
): TestSuite
```

Compose `createTestApp` + `createFactory` + `createTestClient` into a single object for fully isolated test suites with auto-cleanup.

```ts
const suite = createTestSuite(AppModule);

beforeAll(() => suite.setup());
afterAll(() => suite.teardown());
beforeEach(() => suite.reset());

it('returns products', async () => {
  await suite.factory('Product', ProductSchema, { name: 'Widget' })
    .create(suite.connection!);
  const res = await suite.client.get('/products');
  expect(res.data).toHaveLength(1);
});
```

---

### `cleanDatabase`

```ts
async function cleanDatabase(connection: Connection): Promise<void>
```

Drop all collections in a Mongoose connection. Use in `beforeEach` or `afterEach` for test isolation.

```ts
afterEach(async () => {
  await cleanDatabase(connection);
});
```

---

### `seedDatabase`

```ts
async function seedDatabase(
  connection: Connection,
  fixtures: Record<string, Record<string, unknown>[]>,
): Promise<Record<string, string[]>>  // collection → inserted _id strings
```

Seed a Mongoose database with fixture data.

```ts
const ids = await seedDatabase(connection, {
  users: [{ name: 'Alice' }, { name: 'Bob' }],
  products: [{ title: 'Widget', price: 9.99 }],
});
// ids.users = ['64a...', '64b...']
```

## HTTP Client

### `createTestClient`

```ts
function createTestClient(app: INestApplication): TestClient
```

Lightweight HTTP test client built on `supertest` that auto-unwraps the Boot response envelope (`{ success, data, meta }`).

```ts
const client = createTestClient(app);
const { data, status } = await client.get('/products');
const { data: created } = await client.post('/products', { name: 'Test' });
```

Requires `supertest` to be installed as a devDependency.

## Factories

### `createFactory`

```ts
function createFactory<T extends Record<string, any>>(
  modelName: string,
  schema: Schema,
  defaults: FactoryDefaults<T>,
  factoryOptions?: FactoryOptions<T>,
): TestFactory<T>
```

Create a test data factory for a Mongoose model with trait support and sequence generators.

```ts
const productFactory = createFactory<Product>(
  'Product',
  ProductSchema,
  {
    name: (seq) => `Product ${seq}`,
    price: 9.99,
    active: true,
  },
  {
    traits: {
      inactive: { active: false },
      expensive: { price: 999.99 },
    },
    afterCreate: async (doc, connection) => {
      // e.g. create related documents
    },
  },
);

// Build (no DB write)
const data = productFactory.build();
const inactiveData = productFactory.build('inactive');
const items = productFactory.buildMany(5, { price: 49.99 });

// Create in DB
const doc = await productFactory.create(connection);
const inactive = await productFactory.create(connection, 'inactive');
const docs = await productFactory.createMany(3, connection);

// Reset sequence counter
productFactory.resetSequence();
```

## gRPC Testing

### `createGrpcTestClient`

```ts
function createGrpcTestClient(
  app: INestApplication,
  serviceName: string,
  serviceToken?: any,
): GrpcTestClient
```

Create a typed gRPC test client that calls handlers in-process. No actual gRPC server is started — handlers are resolved from NestJS DI and called directly.

```ts
const client = createGrpcTestClient(app, 'OrderService');
const order = await client.call('FindOne', { id: '123' });
const methods = client.listMethods();
```

## Microservice Testing

### `createMessageDispatcher`

```ts
function createMessageDispatcher(app: INestApplication): MessageDispatcher
```

Create a message dispatcher that invokes `@MessagePattern` and `@EventPattern` handlers directly through NestJS DI — no real message broker needed. Scans all controllers and providers in the app for decorated handlers.

```ts
const dispatcher = createMessageDispatcher(app);

// Call a @MessagePattern handler and get the response
const result = await dispatcher.send('find-order', { id: '123' });

// Emit to @EventPattern handlers (fire-and-forget)
await dispatcher.emit('order-created', { orderId: '123' });
```

## Snapshot Testing

### `expectSnapshot`

```ts
function expectSnapshot(data: any, options?: SnapshotOptions): void
```

API response snapshot testing helper. Strips volatile fields before comparison (uses Vitest's `toMatchSnapshot`).

Default stripped fields: `_id`, `id`, `createdAt`, `updatedAt`, `__v`

```ts
const res = await client.get('/products/123');
expectSnapshot(res.data, {
  ignore: ['_id', 'createdAt', 'updatedAt'],
  name: 'product detail',
});
```

---

### `stripVolatileFields`

```ts
function stripVolatileFields(data: any, fields?: string[]): any
```

Strip volatile fields from data without running a snapshot assertion. Useful for custom comparisons on cleaned data.

```ts
const cleaned = stripVolatileFields(res.data, ['_id', 'updatedAt']);
expect(cleaned).toEqual({ name: 'Test', price: 42 });
```

## Contract Testing

### `ContractVerifier`

```ts
class ContractVerifier {
  /**
   * Level 1: Verify that serviceClass implements every method in the contract.
   * Checks method existence and that each is a function.
   */
  static verify(
    serviceClass: new (...args: unknown[]) => unknown,
    contract: ContractDefinition,
  ): VerificationResult

  /**
   * Level 2: Verify a service instance by actually calling methods with test data
   * and validating response shapes against output schemas.
   */
  static async verifyInstance(
    serviceInstance: Record<string, any>,
    contract: ContractDefinition,
  ): Promise<VerificationResult>
}
```

Supports Zod-style (`.parse()`) and Joi-style (`.validate()`) schemas.

```ts
// Level 1: class check
const result = ContractVerifier.verify(UserService, {
  methods: [
    { name: 'findOne', input: z.object({ id: z.string() }), output: userSchema },
  ],
});
expect(result.pass).toBe(true);

// Level 2: instance check with real calls
const result = await ContractVerifier.verifyInstance(userService, {
  methods: [
    { name: 'findOne', testInput: { id: '507f1f77bcf86cd799439011' }, output: userSchema },
  ],
});
```

---

### `createMockGrpcService`

```ts
function createMockGrpcService<T extends ServiceDefinition>(definition: T): T
```

Create a mock gRPC service object from a definition of method names → response factories. Usable as a custom provider in `Test.createTestingModule()`.

```ts
const mock = createMockGrpcService({
  findOne: (req) => ({ id: req.id, name: 'Test' }),
  findAll: () => ({ items: [] }),
});

// In TestingModule:
{
  provide: ORDER_SERVICE,
  useValue: mock,
}
```

## Auth Helpers

### `createTestJwt`

```ts
function createTestJwt(
  payload: Record<string, any>,
  options?: CreateTestJwtOptions,
): string
```

Create a valid JWT for testing. Uses a default test secret (`nestjs-boot-test-secret-do-not-use-in-prod`) when no secret is provided.

```ts
const token = createTestJwt({ sub: 'user-123', role: 'admin' });
const tokenWithExpiry = createTestJwt({ sub: 'user-123' }, { expiresIn: '1h' });
```

---

### `createTestApiKey`

```ts
function createTestApiKey(permissions?: string[]): string
```

Create a deterministic test API key string with optional permissions metadata.

```ts
const key = createTestApiKey(['read:products', 'write:products']);
// → 'test-api-key-cmVhZDpwcm'
```

---

### `createAuthenticatedRequest`

```ts
function createAuthenticatedRequest(
  payload: Record<string, any>,
  options?: CreateTestJwtOptions,
): { headers: { authorization: string } }
```

Create a mock request object with a Bearer token for unit-testing guards and services.

```ts
const req = createAuthenticatedRequest({ sub: 'user-123' });
// req.headers.authorization = 'Bearer eyJ...'
```

---

### `MockAuthModule`

NestJS module that bypasses all auth guards for e2e tests where auth is not the focus.

```ts
@Module({})
class MockAuthModule {
  static register(mockUser?: Record<string, any>): DynamicModule
}
```

```ts
const module = await Test.createTestingModule({
  imports: [MockAuthModule.register({ sub: 'test-user-id', role: 'admin' }), AppModule],
}).compile();
```

Default mock user when none is provided: `{ sub: 'test-user-id', email: 'test@example.com' }`

## Interfaces

### `CreateTestAppOptions`

```ts
interface CreateTestAppOptions extends Partial<BootOptions> {
  /** Override DI providers for mocking services. */
  overrideProviders?: Provider[];

  /**
   * When true, returns a beforeEachClean function that drops all collections.
   * Call it in beforeEach for test isolation.
   */
  autoClean?: boolean;
}
```

### `TestAppContext`

```ts
interface TestAppContext {
  app: INestApplication;
  module: TestingModule;
  mongoUri: string;
  mongoConnection: Connection | undefined;
  cleanup: () => Promise<void>;          // call in afterAll
  beforeEachClean: () => Promise<void>;  // call in beforeEach (when autoClean: true)
}
```

### `TestSuite`

```ts
interface TestSuite {
  setup(): Promise<void>;     // call in beforeAll
  teardown(): Promise<void>;  // call in afterAll
  reset(): Promise<void>;     // call in beforeEach (cleans DB)
  app: INestApplication;
  module: TestingModule;
  client: TestClient;
  connection: Connection | undefined;
  inject<T>(token: Type<T> | string | symbol): T;
  factory<T>(modelName: string, schema: Schema, defaults: Record<string, any>): TestFactory<T>;
}
```

### `TestClient`

```ts
interface TestClient {
  get<T = any>(url: string, headers?: Record<string, string>): Promise<TestResponse<T>>;
  post<T = any>(url: string, body?: any, headers?: Record<string, string>): Promise<TestResponse<T>>;
  put<T = any>(url: string, body?: any, headers?: Record<string, string>): Promise<TestResponse<T>>;
  patch<T = any>(url: string, body?: any, headers?: Record<string, string>): Promise<TestResponse<T>>;
  delete<T = any>(url: string, headers?: Record<string, string>): Promise<TestResponse<T>>;
  setBearerToken(token: string): void;
}
```

### `TestResponse<T>`

```ts
interface TestResponse<T = any> {
  status: number;
  data: T;       // envelope-unwrapped (data field) if envelope format, otherwise raw body
  raw: any;      // raw response body
  headers: Record<string, string>;
}
```

### `TestFactory<T>`

```ts
interface TestFactory<T> {
  build(overrides?: Partial<T>): T;
  build(trait: string, overrides?: Partial<T>): T;
  buildMany(count: number, overrides?: Partial<T>): T[];
  buildMany(count: number, trait: string, overrides?: Partial<T>): T[];
  create(connection: Connection, overrides?: Partial<T>): Promise<T & { _id: any }>;
  create(connection: Connection, trait: string, overrides?: Partial<T>): Promise<T & { _id: any }>;
  createMany(count: number, connection: Connection, overrides?: Partial<T>): Promise<(T & { _id: any })[]>;
  createMany(count: number, connection: Connection, trait: string, overrides?: Partial<T>): Promise<(T & { _id: any })[]>;
  resetSequence(): void;
}
```

### `FactoryOptions<T>`

```ts
interface FactoryOptions<T> {
  traits?: Record<string, Partial<FactoryDefaults<T>>>;
  afterCreate?: (doc: T & { _id: any }, connection: Connection) => Promise<void>;
}
```

### `GrpcTestClient`

```ts
interface GrpcTestClient {
  call<R = any>(methodName: string, data?: any, metadata?: Record<string, string>): Promise<R>;
  listMethods(): string[];
}
```

### `MessageDispatcher`

```ts
interface MessageDispatcher {
  send<R = any>(pattern: string, data: any): Promise<R>;
  emit(pattern: string, data: any): Promise<void>;
}
```

### `SnapshotOptions`

```ts
interface SnapshotOptions {
  ignore?: string[];  // field names to strip recursively. Default: _id, id, createdAt, updatedAt, __v
  name?: string;      // snapshot name passed to toMatchSnapshot
}
```

### `ContractDefinition`

```ts
interface ContractDefinition {
  methods: ContractMethod[];
}

interface ContractMethod {
  name: string;
  input: SchemaLike;   // Zod (.parse) or Joi (.validate) schema
  output: SchemaLike;
  testInput?: unknown; // test data for verifyInstance
}

interface SchemaLike {
  parse?: (data: unknown) => unknown;
  validate?: (data: unknown) => { error?: unknown; value?: unknown };
}

interface VerificationResult {
  pass: boolean;
  violations: string[];
}
```

### `CreateTestJwtOptions`

```ts
interface CreateTestJwtOptions {
  secret?: string;
  expiresIn?: string | number;
  algorithm?: jwt.Algorithm;
}
```

## Constants

| Constant | Value | Description |
|---|---|---|
| `TEST_SECRET` | `'nestjs-boot-test-secret-do-not-use-in-prod'` | Default JWT secret for test helpers |
