# 08 - Error Handling

Good error handling means your API fails gracefully with clear, consistent messages.

## NestJS Built-in Exceptions

```typescript
throw new BadRequestException('Invalid input');       // 400
throw new UnauthorizedException('Invalid token');     // 401
throw new ForbiddenException('Admin only');           // 403
throw new NotFoundException('Product not found');     // 404
throw new ConflictException('Email already exists');  // 409
throw new InternalServerErrorException('DB error');   // 500
```

Each produces a consistent JSON response:

```json
{
  "statusCode": 404,
  "message": "Product not found",
  "error": "Not Found"
}
```

## nestjs-boot Error Handler

With `response.errorHandler: true` in your config, nestjs-boot adds an `AllExceptionsFilter` that catches EVERY unhandled error (not just NestJS exceptions) and formats them consistently.

Without it, an unhandled `TypeError` would crash your process. With it, the client gets a proper 500 response and your server keeps running.

## Response Envelope (Optional)

With `response.envelope: true`, ALL responses are wrapped:

```json
{
  "data": { "name": "Mouse", "price": 29.99 },
  "meta": { "timestamp": "2024-01-15T10:30:00Z", "path": "/products/123" }
}
```

This makes client code simpler -- every response has the same shape.

## Best Practices

1. **Throw early, catch late**: Throw exceptions in services, let NestJS handle formatting.
2. **Use specific exceptions**: `NotFoundException` is better than `BadRequestException('not found')`.
3. **Never expose internal errors**: Don't send stack traces or DB error details to clients.
4. **Log everything server-side**: The user sees a clean error; your logs have the full stack trace.

```typescript
// Good: specific exception with context
throw new NotFoundException(`Product with id "${id}" not found`);

// Bad: generic error
throw new Error('not found');

// Bad: exposing internals
throw new BadRequestException(mongoError.message);
```

## Try It Yourself

```bash
# Trigger a 404
curl http://localhost:3000/products/000000000000000000000000

# Trigger a validation error (if ValidationPipe is enabled)
curl -X POST http://localhost:3000/products \
  -H "Content-Type: application/json" \
  -d '{"name":123}'
```

---

Next: [09 - Testing](09-testing.md)
