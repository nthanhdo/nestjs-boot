# 07 - Authentication (JWT + Guards)

Authentication verifies WHO you are. Authorization checks WHAT you can do.

## JWT Flow

```
1. Client -> POST /auth/login { email, password }
2. Server -> verifies credentials -> returns { accessToken, refreshToken }
3. Client -> stores tokens
4. Client -> GET /products  (header: Authorization: Bearer <accessToken>)
5. Server -> JwtAuthGuard verifies token -> allows request
```

## nestjs-boot Auth Setup

In `main.ts`:

```typescript
auth: {
  jwt: {
    secret: 'your-secret-key',
    signOptions: { expiresIn: '15m' },
    refreshSecret: 'your-refresh-secret',
    refreshExpiresIn: '7d',
  },
},
```

This auto-registers:
- `JwtAuthGuard` as a **global** guard (all endpoints require auth by default)
- `BootJwtService` for signing/verifying tokens in your services
- `@Public()` decorator to exempt specific endpoints

## The @Public() Decorator

```typescript
@Public()      // no token required
@Get()
findAll() { ... }

@Post()        // token required (default when auth is configured)
create() { ... }
```

## Using BootJwtService

```typescript
import { BootJwtService } from 'nestjs-boot';

constructor(private readonly jwt: BootJwtService) {}

// Sign an access token
const token = this.jwt.sign({ sub: userId, email, roles });

// Verify a token
const decoded = this.jwt.verify(token);

// Sign/verify refresh tokens (separate secret)
const refresh = this.jwt.signRefresh({ sub: userId });
const decoded = this.jwt.verifyRefresh(refresh);
```

## Accessing the Current User

In any controller with auth enabled:

```typescript
@Get('me')
async getProfile(@Request() req: any) {
  // req.user contains the decoded JWT payload
  console.log(req.user);
  // { sub: '507f1f77bcf86cd799439011', email: 'alice@ex.com', roles: ['user'] }
}
```

## Try It Yourself

```bash
# 1. Register
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"alice@example.com","password":"secret123","name":"Alice"}'

# 2. Login (copy the accessToken from the response)
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"alice@example.com","password":"secret123"}'

# 3. Access protected endpoint
curl http://localhost:3000/auth/me \
  -H "Authorization: Bearer <paste-your-token>"

# 4. Try without token (should get 401)
curl http://localhost:3000/auth/me
```

## Exercise

Try [Exercise 04: Add Auth Guard](../exercises/04-add-auth-guard.md)

---

Next: [08 - Error Handling](08-error-handling.md)
