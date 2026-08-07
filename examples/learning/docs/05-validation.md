# 05 - Validation (DTOs + class-validator)

Never trust client input. Validation ensures your API receives correct data.

## DTOs (Data Transfer Objects)

A DTO is a class that defines what the request body should look like:

```typescript
export class CreateProductDto {
  @IsString()
  @MaxLength(200)
  name!: string;

  @IsNumber()
  @Min(0)
  price!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  stock?: number;
}
```

## Common Decorators

| Decorator | What it checks |
|-----------|---------------|
| `@IsString()` | Must be a string |
| `@IsNumber()` | Must be a number |
| `@IsEmail()` | Must be a valid email |
| `@IsOptional()` | Field can be omitted |
| `@Min(0)` | Number must be >= 0 |
| `@Max(100)` | Number must be <= 100 |
| `@MaxLength(200)` | String must be <= 200 chars |
| `@IsEnum(MyEnum)` | Must be a value from the enum |
| `@IsArray()` | Must be an array |
| `@ValidateNested()` | Validate nested objects |

## Enabling Validation

Add a `ValidationPipe` after `createApp()` in `main.ts`:

```typescript
import { ValidationPipe } from '@nestjs/common';

const app = await createApp(AppModule, { ... });

app.useGlobalPipes(new ValidationPipe({
  whitelist: true,    // strip unknown properties
  transform: true,    // auto-convert types ("5" -> 5)
  forbidNonWhitelisted: true, // reject unknown properties with 400
}));
```

## What Happens on Invalid Input

```bash
curl -X POST http://localhost:3000/products \
  -H "Content-Type: application/json" \
  -d '{"name":123,"price":-5}'
```

Response (400 Bad Request):
```json
{
  "statusCode": 400,
  "message": [
    "name must be a string",
    "price must not be less than 0"
  ],
  "error": "Bad Request"
}
```

## whitelist vs forbidNonWhitelisted

```bash
# Body: { "name": "Mouse", "price": 10, "hacked": true }

# whitelist: true -> strips "hacked", processes normally
# forbidNonWhitelisted: true -> rejects with 400
```

## Try It Yourself

```bash
# Valid request
curl -X POST http://localhost:3000/products \
  -H "Content-Type: application/json" \
  -d '{"name":"Valid Product","price":10,"stock":5}'

# Invalid: negative price
curl -X POST http://localhost:3000/products \
  -H "Content-Type: application/json" \
  -d '{"name":"Bad","price":-1}'

# Invalid: missing required field
curl -X POST http://localhost:3000/products \
  -H "Content-Type: application/json" \
  -d '{"price":10}'
```

---

Next: [06 - Caching](06-caching.md)
