# Deploy Hooks

> **TL;DR** — `DeployHooksModule` cung cấp vòng đời theo pha cho các kiểm tra lúc deploy: xác thực môi trường, kiểm tra kết nối dependency, migration database, và cổng sẵn sàng (readiness gate). Đăng ký hook qua cấu hình hoặc decorator `@OnDeploy`.

## Cài đặt

```ts
import { DeployHooksModule } from 'nestjs-boot/deploy';

@Module({
  imports: [
    DeployHooksModule.register({
      enabled: true,
      requiredEnvVars: ['DATABASE_URL', 'REDIS_URL', 'JWT_SECRET'],
      dependencyCheck: true,
      readinessDelay: 2000,
    }),
  ],
})
export class AppModule {}
```

Module đăng ký toàn cục và sử dụng NestJS `DiscoveryService` để quét các phương thức có decorator `@OnDeploy` khi khởi tạo.

## Các pha Deploy

Hook thực thi theo thứ tự pha nghiêm ngặt. Mỗi pha chạy các hook tuần tự, sắp xếp theo `order` (tăng dần).

```
preStart → preMigrate → postMigrate → postStart → healthGate
```

| Pha | Mục đích | Hook điển hình |
|-----|----------|----------------|
| `preStart` | Xác thực môi trường và kết nối trước khi bắt đầu | EnvValidation, DependencyCheck |
| `preMigrate` | Chuẩn bị trước migration (backup, khóa) | Hook backup tùy chỉnh |
| `postMigrate` | Xác minh sau migration (kiểm tra schema) | Bộ kiểm tra schema tùy chỉnh |
| `postStart` | App đang chạy nhưng chưa tuyên bố sẵn sàng | Làm ấm cache, dữ liệu seed |
| `healthGate` | Kiểm tra health endpoint cho đến khi healthy, sau đó báo sẵn sàng | ReadinessGate |

Nếu bất kỳ hook nào throw, pha đó thất bại và các pha tiếp theo không thực thi.

## Hook tích hợp sẵn

### EnvValidationHook

Xác thực các biến môi trường bắt buộc trước khi khởi động. Chạy đầu tiên trong `preStart` (order: -100).

```ts
import { EnvValidationHook } from 'nestjs-boot/deploy';

deployService.registerHook(
  new EnvValidationHook(['DATABASE_URL', 'REDIS_URL', 'API_KEY']),
);
```

Throw kèm danh sách biến thiếu nếu có biến nào chưa được định nghĩa.

### DependencyCheckHook

Kiểm tra kết nối đến MongoDB và Redis trước khi khởi động. Chạy trong `preStart` (order: -50).

```ts
import { DependencyCheckHook } from 'nestjs-boot/deploy';

deployService.registerHook(new DependencyCheckHook());
```

- **MongoDB**: Tạo kết nối thử đến từng `database.connections[name].writerUri` đã cấu hình, sau đó đóng.
- **Redis**: Kết nối đến `cache.redis.url`, gửi PING, sau đó thoát.
- Bỏ qua kiểm tra cho các service chưa cấu hình trong `BootOptions`.

### ReadinessGateHook

Kiểm tra health endpoint cho đến khi trả về 2xx, sau đó đánh dấu service sẵn sàng. Chạy trong pha `healthGate`.

```ts
import { ReadinessGateHook } from 'nestjs-boot/deploy';

deployService.registerHook(
  new ReadinessGateHook({
    maxAttempts: 30,    // mặc định: 30
    intervalMs: 1000,   // mặc định: 1000
    delayMs: 2000,      // chờ trước lần kiểm tra đầu (mặc định: 0)
  }),
);
```

Sử dụng health path từ `BootOptions` (mặc định: `/health`). Throw sau `maxAttempts` lần kiểm tra thất bại.

## Decorator @OnDeploy

Đánh dấu bất kỳ phương thức injectable nào là deploy hook:

```ts
import { OnDeploy } from 'nestjs-boot/deploy';

@Injectable()
export class MigrationService {
  @OnDeploy('preMigrate', 10)  // pha, thứ tự
  async backupDatabase(ctx: DeployContext): Promise<void> {
    ctx.logger.log(`Đang backup database cho ${ctx.environment}...`);
    await this.backupService.createSnapshot();
  }

  @OnDeploy('postMigrate', 0)
  async verifySchema(ctx: DeployContext): Promise<void> {
    ctx.logger.log('Đang xác minh tính toàn vẹn schema...');
    await this.schemaValidator.check();
  }
}
```

`DeployHookScanner` phát hiện các decorator này khi module init bằng NestJS `DiscoveryService` và đăng ký với `DeployService`. Định dạng tên hook: `ClassName.methodName`.

## DeployContext

Mỗi hook nhận một `DeployContext`:

```ts
interface DeployContext {
  phase: DeployPhase;      // pha hiện tại
  environment: string;     // ví dụ 'production', 'staging'
  version: string;         // phiên bản app
  startTime: Date;         // thời điểm deploy bắt đầu
  logger: Logger;          // instance NestJS Logger
  config: BootOptions;     // cấu hình app đầy đủ
}
```

Dùng `ctx.logger` cho structured logging — output tự động bao gồm tên hook và thời gian.

## Hook deploy tùy chỉnh

Implement interface `DeployHook` và đăng ký với `DeployService`:

```ts
import { DeployHook, DeployContext } from 'nestjs-boot/deploy';

export class CacheWarmupHook implements DeployHook {
  readonly name = 'CacheWarmup';
  readonly phase = 'postStart' as const;
  readonly order = 10;

  async execute(context: DeployContext): Promise<void> {
    context.logger.log('Đang làm ấm cache...');
    await this.cacheService.warmup();
    context.logger.log('Cache đã ấm');
  }
}

deployService.registerHook(new CacheWarmupHook());
```

## Thực thi các pha

`DeployService` cung cấp `executePhase()` để kiểm soát lập trình:

```ts
const context: DeployContext = {
  phase: 'preStart',
  environment: process.env.NODE_ENV ?? 'production',
  version: process.env.APP_VERSION ?? '0.0.0',
  startTime: new Date(),
  logger: new Logger('Deploy'),
  config: bootOptions,
};

await deployService.executePhase('preStart', context);
await deployService.executePhase('preMigrate', context);
await deployService.executePhase('postMigrate', context);
await deployService.executePhase('postStart', context);
await deployService.executePhase('healthGate', context);
```

Mỗi pha ghi log số lượng hook, thời gian từng hook, và tổng thời gian.

## Tích hợp với K8s Rolling Deploy

Sử dụng pha `healthGate` để tích hợp với Kubernetes readiness probe:

```yaml
spec:
  containers:
    - name: app
      readinessProbe:
        httpGet:
          path: /health
          port: 3000
        initialDelaySeconds: 5
        periodSeconds: 3
```

Luồng:
1. Pod khởi động -> `preStart` xác thực env + kết nối
2. Migration chạy (nếu cấu hình) -> `preMigrate` / `postMigrate`
3. App bind port -> `postStart` làm ấm cache
4. `healthGate` kiểm tra `/health` -> trả về 200 -> K8s đánh dấu pod Ready
5. K8s định tuyến traffic đến pod mới, thoát pod cũ

Nếu bất kỳ pha nào thất bại, process thoát non-zero và K8s không định tuyến traffic.

## Tham chiếu cấu hình

### DeployOptions

| Tùy chọn | Kiểu | Mặc định | Mô tả |
|----------|------|----------|-------|
| `enabled` | `boolean` | `true` | Bật/tắt module |
| `requiredEnvVars` | `string[]` | `[]` | Biến env cần xác thực trong preStart |
| `dependencyCheck` | `boolean` | `false` | Bật kiểm tra kết nối MongoDB/Redis |
| `readinessDelay` | `number` | `0` | Delay tính bằng ms trước khi health gate bắt đầu |
| `hooks` | `DeployHook[]` | `[]` | Các hook bổ sung cần đăng ký |

### Interface DeployHook

| Thuộc tính | Kiểu | Bắt buộc | Mô tả |
|------------|------|----------|-------|
| `name` | `string` | Có | Định danh hook (dùng trong log) |
| `phase` | `DeployPhase` | Có | Pha nào sẽ chạy |
| `order` | `number` | Không | Thứ tự thực thi trong pha (mặc định: 0) |
| `execute` | `(ctx: DeployContext) => Promise<void>` | Có | Logic hook |

## Xem thêm

- [Health & Shutdown](health-shutdown.md) — health endpoint dùng bởi ReadinessGateHook
- [Configuration](configuration.md) — cấu trúc BootOptions
- [Production Checklist](production-checklist.md) — các bước xác minh deploy
