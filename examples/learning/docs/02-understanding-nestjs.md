# 02 - Understanding NestJS

NestJS is a framework for building Node.js server-side applications. It borrows ideas from Angular (decorators, modules, DI) and applies them to backend development.

## The Three Building Blocks

### 1. Modules

A module groups related code. Think of it as a folder with a manifest:

```typescript
@Module({
  imports: [],       // other modules this one depends on
  controllers: [],   // HTTP handlers
  providers: [],     // services (business logic)
  exports: [],       // things other modules can use
})
export class ProductModule {}
```

Every NestJS app has exactly one root module (`AppModule`). Real apps have many feature modules imported into the root.

### 2. Controllers

Controllers handle HTTP requests. Decorators map methods to routes:

```typescript
@Controller('products')         // prefix: /products
export class ProductController {
  @Get()                        // GET /products
  findAll() { ... }

  @Get(':id')                   // GET /products/abc123
  findOne(@Param('id') id: string) { ... }

  @Post()                       // POST /products
  create(@Body() dto: CreateProductDto) { ... }
}
```

Controllers should be THIN -- just parse the request, call a service, return the result.

### 3. Services (Providers)

Services contain business logic. They're decorated with `@Injectable()`:

```typescript
@Injectable()
export class ProductService {
  constructor(
    @InjectModel('Product') private productModel: Model<ProductDocument>,
  ) {}

  async findAll() {
    return this.productModel.find().exec();
  }
}
```

## Dependency Injection (DI)

This is the most important concept in NestJS. Instead of creating objects yourself:

```typescript
// WITHOUT DI (the old way)
const service = new ProductService(new MongooseModel(...));
const controller = new ProductController(service);
```

NestJS does it for you:

```typescript
// WITH DI (NestJS way)
@Controller('products')
export class ProductController {
  // NestJS automatically creates and injects ProductService
  constructor(private readonly productService: ProductService) {}
}
```

DI makes testing trivial -- swap the real service with a mock in tests.

## How nestjs-boot Fits In

Without nestjs-boot, you'd manually wire infrastructure:

```typescript
// WITHOUT nestjs-boot: ~40 lines of manual module setup
MongooseModule.forRoot(uri),
CacheModule.register({ store: redisStore, ... }),
JwtModule.register({ secret, signOptions }),
// ... health, guards, filters, interceptors ...
```

With nestjs-boot, ONE config object does it all:

```typescript
// WITH nestjs-boot: one call
const app = await createApp(AppModule, {
  database: { connections: { master: { writerUri: '...' } } },
  cache: { redis: { url: '...' } },
  auth: { jwt: { secret: '...' } },
});
```

## Try It Yourself

Open `src/app.module.ts` and read the comments. Then try:

```bash
# This endpoint exists because of HealthModule (auto-created by nestjs-boot)
curl http://localhost:3000/health
```

---

Next: [03 - Database](03-database.md)
