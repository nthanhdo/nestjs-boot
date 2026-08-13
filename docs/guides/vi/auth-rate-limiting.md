# Rate Limiting Endpoint Auth

nestjs-boot không tích hợp rate limiter (giữ phạm vi gọn). Sử dụng `@nestjs/throttler` — giải pháp chính thức của NestJS.

## Cài đặt

```bash
npm install @nestjs/throttler
```

## Áp dụng chỉ cho endpoint auth

```ts
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { Controller, Post, UseGuards } from '@nestjs/common';

// 1. Đăng ký ThrottlerModule trong app
@Module({
  imports: [
    ThrottlerModule.forRoot([{
      ttl: 60000,   // cửa sổ 1 phút
      limit: 5,     // 5 lần thử mỗi cửa sổ
    }]),
  ],
})
export class AppModule {}

// 2. Áp dụng chỉ cho auth controller (KHÔNG global)
@Controller('auth')
@UseGuards(ThrottlerGuard)
export class AuthController {
  @Post('login')
  login() { /* ... */ }

  @Post('forgot-password')
  forgotPassword() { /* ... */ }
}
```

## Throttler tùy chỉnh cho auth (giới hạn nghiêm ngặt hơn)

```ts
import { ThrottlerGuard, ThrottlerException } from '@nestjs/throttler';
import { Injectable, ExecutionContext } from '@nestjs/common';

@Injectable()
export class AuthThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    // Theo dõi theo IP + endpoint cho route auth
    return `${req.ip}-${req.path}`;
  }

  protected async throwThrottlingException(): Promise<void> {
    throw new ThrottlerException('Too many authentication attempts. Try again later.');
  }
}

// Sử dụng:
@Controller('auth')
@UseGuards(AuthThrottlerGuard)
export class AuthController { /* ... */ }
```

## Giới hạn theo route

```ts
import { Throttle, SkipThrottle } from '@nestjs/throttler';

@Controller('auth')
@UseGuards(ThrottlerGuard)
export class AuthController {
  @Post('login')
  @Throttle([{ ttl: 60000, limit: 5 }])  // 5/phút cho login
  login() {}

  @Post('forgot-password')
  @Throttle([{ ttl: 60000, limit: 3 }])  // 3/phút cho reset mật khẩu
  forgotPassword() {}

  @Post('refresh')
  @Throttle([{ ttl: 60000, limit: 10 }]) // 10/phút cho refresh (ít nhạy cảm hơn)
  refresh() {}

  @Get('profile')
  @SkipThrottle()  // Không rate limit cho route đọc đã xác thực
  profile() {}
}
```

## Tại sao không tích hợp sẵn?

Rate limiting là chính sách hạ tầng, không phải logic auth. Mỗi dự án cần giới hạn khác nhau, backend lưu trữ khác nhau (Redis cho phân tán, memory cho single-instance), và quy tắc phạm vi khác nhau. `@nestjs/throttler` xử lý tất cả tốt. Tích hợp riêng sẽ trùng lặp công sức mà không thêm giá trị.
