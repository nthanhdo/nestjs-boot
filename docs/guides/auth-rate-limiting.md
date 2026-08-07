# Rate Limiting Auth Endpoints

nestjs-boot does not ship a rate limiter (keeps scope tight). Use `@nestjs/throttler` — the official NestJS solution.

## Setup

```bash
npm install @nestjs/throttler
```

## Apply to auth endpoints only

```ts
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { Controller, Post, UseGuards } from '@nestjs/common';

// 1. Register ThrottlerModule in your app
@Module({
  imports: [
    ThrottlerModule.forRoot([{
      ttl: 60000,   // 1 minute window
      limit: 5,     // 5 attempts per window
    }]),
  ],
})
export class AppModule {}

// 2. Apply to auth controller only (NOT globally)
@Controller('auth')
@UseGuards(ThrottlerGuard)
export class AuthController {
  @Post('login')
  login() { /* ... */ }

  @Post('forgot-password')
  forgotPassword() { /* ... */ }
}
```

## Custom throttler for auth (stricter limits)

```ts
import { ThrottlerGuard, ThrottlerException } from '@nestjs/throttler';
import { Injectable, ExecutionContext } from '@nestjs/common';

@Injectable()
export class AuthThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    // Track by IP + endpoint for auth routes
    return `${req.ip}-${req.path}`;
  }

  protected async throwThrottlingException(): Promise<void> {
    throw new ThrottlerException('Too many authentication attempts. Try again later.');
  }
}

// Usage:
@Controller('auth')
@UseGuards(AuthThrottlerGuard)
export class AuthController { /* ... */ }
```

## Per-route limits

```ts
import { Throttle, SkipThrottle } from '@nestjs/throttler';

@Controller('auth')
@UseGuards(ThrottlerGuard)
export class AuthController {
  @Post('login')
  @Throttle([{ ttl: 60000, limit: 5 }])  // 5/min for login
  login() {}

  @Post('forgot-password')
  @Throttle([{ ttl: 60000, limit: 3 }])  // 3/min for password reset
  forgotPassword() {}

  @Post('refresh')
  @Throttle([{ ttl: 60000, limit: 10 }]) // 10/min for refresh (less sensitive)
  refresh() {}

  @Get('profile')
  @SkipThrottle()  // No rate limit on read-only authenticated routes
  profile() {}
}
```

## Why not built-in?

Rate limiting is infrastructure policy, not auth logic. Different projects need different limits, storage backends (Redis for distributed, memory for single-instance), and scoping rules. `@nestjs/throttler` handles all of this well. Shipping our own would duplicate effort without adding value.
