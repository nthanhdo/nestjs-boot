# DI Contract, Layer & Chẩn đoán — nestjs-boot

> DI dựa trên interface, thực thi lớp kiến trúc, phân tích đồ thị module, và chẩn đoán lỗi DI.

---

## 1. Dependency Injection dựa trên Contract

Contract cho phép module phụ thuộc vào interface thay vì implementation cụ thể, loại bỏ import vòng.

### createContract — Định nghĩa Typed Token

```ts
// shared/contracts.ts (không import module — chỉ type)
import { createContract } from 'nestjs-boot';

export const IUserLookup = createContract<{
  findById(id: string): Promise<User>;
  findByEmail(email: string): Promise<User | null>;
}>('IUserLookup');

export const IOrderService = createContract<{
  getOrdersForUser(userId: string): Promise<Order[]>;
}>('IOrderService');
```

`createContract<T>(name)` trả về đối tượng `Contract<T>` với `Symbol` token duy nhất và phantom type để suy luận.

### @InjectContract — Sử dụng Contract

```ts
import { InjectContract } from 'nestjs-boot';
import { IUserLookup } from '../shared/contracts';
import type { ContractType } from 'nestjs-boot';

@Injectable()
export class OrderService {
  constructor(
    @InjectContract(IUserLookup)
    private readonly userLookup: ContractType<typeof IUserLookup>,
  ) {}

  async getOrder(userId: string) {
    const user = await this.userLookup.findById(userId);
    // OrderModule không bao giờ import UserModule
  }
}
```

### provideContract — Gắn Implementation

```ts
import { provideContract, provideContractFactory } from 'nestjs-boot';
import { IUserLookup } from '../shared/contracts';

@Module({
  providers: [
    UserService,
    provideContract(IUserLookup, UserService),
    // tương đương: { provide: IUserLookup.token, useExisting: UserService }
  ],
  exports: [IUserLookup.token],
})
export class UserModule {}
```

Cho binding dựa trên factory:

```ts
provideContractFactory(IConfig, () => loadConfig(), [ConfigService])
// tương đương: { provide: IConfig.token, useFactory: ..., inject: [...] }
```

### validateContracts — Mạng lưới an toàn cho Dev-Mode

Gọi sau khi tạo app để phát hiện sớm contract thiếu binding:

```ts
import { validateContracts } from 'nestjs-boot';

const app = await createApp(AppModule, options);
validateContracts(app, [IUserLookup, IOrderService]);
// Log cảnh báo: 'Contract "IOrderService" has no provider...'
```

---

## 2. Lớp kiến trúc

Decorator `@Layer` và hàm thực thi `validateLayers` ngăn import ngược hướng (ví dụ: module CORE import module DOMAIN).

### Enum ModuleLayer

```ts
enum ModuleLayer {
  CORE = 0,            // nội bộ nestjs-boot (DatabaseModule, CacheModule, v.v.)
  INFRASTRUCTURE = 1,  // adapter, client service bên ngoài
  DOMAIN = 2,          // module logic nghiệp vụ (mặc định cho module không có decorator)
  APPLICATION = 3,     // controller, bề mặt API, điều phối
}
```

Số thấp hơn = lớp thấp hơn. Module có thể import từ lớp của nó hoặc bên dưới, không bao giờ bên trên.

### Decorator @Layer

```ts
import { Layer, ModuleLayer } from 'nestjs-boot';

@Layer(ModuleLayer.INFRASTRUCTURE)
@Module({
  providers: [StripeGateway, EmailAdapter],
  exports: [StripeGateway, EmailAdapter],
})
export class InfrastructureModule {}

@Layer(ModuleLayer.APPLICATION)
@Module({
  imports: [OrderModule, InfrastructureModule],  // OK: APPLICATION import DOMAIN và INFRA
  controllers: [OrderController],
})
export class OrderApiModule {}
```

Tất cả module core của nestjs-boot (`DatabaseModule`, `CacheModule`, `AuthModule`, v.v.) được tự động gán `CORE`. Module người dùng không có decorator mặc định là `DOMAIN`.

### validateLayers — Kiểm tra hướng Import

```ts
import { validateLayers } from 'nestjs-boot';

const app = await createApp(AppModule, options);

// Chế độ cảnh báo (mặc định)
const result = validateLayers(app);
// result.valid === false nếu phát hiện vi phạm
// result.violations = [{ module, moduleLayer, importedModule, importedLayer, message }]

// Chế độ nghiêm ngặt — ném lỗi khi vi phạm
validateLayers(app, { strict: true });

// Cho phép ngoại lệ cụ thể
validateLayers(app, {
  customRules: {
    allow: [{ from: 'SharedModule', to: 'UserApiModule' }],
  },
});
```

---

## 3. Phân tích đồ thị Module

Phân tích tĩnh metadata `@Module({ imports })` từ file source. Hoạt động mà không cần khởi động app.

### analyzeModules

```ts
import { analyzeModules } from 'nestjs-boot';

const result = analyzeModules('/path/to/project');
// result.modules  — ModuleNode[] (name, filePath, imports, exports, providers)
// result.edges    — { from, to }[] (quan hệ import)
// result.cycles   — string[][] (vòng lặp phát hiện qua Tarjan's SCC)
// result.stats    — { totalModules, totalEdges, maxFanOut, maxFanIn, cycleCount }
```

Quét `src/` tìm file `*.module.ts` (fallback về `dist/*.module.js`).

### detectCycles

Phát hiện vòng lặp độc lập sử dụng thuật toán Strongly Connected Components của Tarjan:

```ts
import { detectCycles } from 'nestjs-boot';

const cycles = detectCycles(
  ['A', 'B', 'C', 'D'],
  [{ from: 'A', to: 'B' }, { from: 'B', to: 'C' }, { from: 'C', to: 'A' }],
);
// [['A', 'B', 'C']]
```

### renderMermaid / renderJson

```ts
import { renderMermaid, renderJson } from 'nestjs-boot';

const graph = analyzeModules('.');
console.log(renderMermaid(graph));
// graph TD
//     AppModule --> UserModule
//     AppModule --> OrderModule
//     style UserModule fill:#ef4444,stroke:#dc2626,color:#fff   (nếu trong vòng lặp)

console.log(renderJson(graph));  // JSON với modules, edges, cycles, stats
```

---

## 4. Chẩn đoán lỗi DI

### parseDiError / formatDiError

Phân tích lỗi DI khó hiểu của NestJS thành thông báo có cấu trúc, có thể hành động.

```ts
import { parseDiError, formatDiError } from 'nestjs-boot';

try {
  await createApp(AppModule, options);
} catch (error) {
  const info = parseDiError(error);
  if (info) {
    console.error(formatDiError(info));
    // ╔══════════════════════════════════════╗
    // ║  nestjs-boot: DI Error Detected      ║
    // ╚══════════════════════════════════════╝
    //
    // UNRESOLVED DEPENDENCY
    //   Modules involved: OrderModule
    //   Providers: UserService
    //
    //   FIX:
    //   Ensure UserService is provided and exported...
  }
}
```

Các loại lỗi phát hiện: `'circular'` (dependency vòng) và `'unresolved'` (thiếu provider). Mỗi loại bao gồm tên module bị ảnh hưởng, tên provider, thông báo gốc, và gợi ý sửa lỗi cụ thể.

### scanForCircularDepWarnings

Công cụ quét sau khởi động cảnh báo về import qua lại và god-module (>10 import). Chỉ dev-mode, không chặn.

```ts
import { scanForCircularDepWarnings } from 'nestjs-boot';

const app = await createApp(AppModule, options);
scanForCircularDepWarnings(app);
// [nestjs-boot:di] Mutual import detected: UserModule <-> OrderModule...
// [nestjs-boot:di] Module "AppModule" imports 14 modules. Consider splitting...
```

### StartupProfiler

Đo thời gian dành cho mỗi giai đoạn `createApp`. Tự động bật khi `NODE_ENV !== 'production'`.

```ts
import { StartupProfiler } from 'nestjs-boot';

const profiler = new StartupProfiler();       // tự động bật trong dev
profiler.startPhase('Config validation');
// ... công việc ...
profiler.startPhase('NestFactory.create');     // tự động kết thúc giai đoạn trước
// ... công việc ...
profiler.endPhase();
profiler.log();
// [boot] Config validation: 12ms
// [boot] NestFactory.create: 340ms
// [boot] Total: 352ms

const results = profiler.getResults();         // PhaseResult[]
const total = profiler.getTotalMs();
```

---

## 5. Thực hành tốt nhất

### Cạm bẫy Barrel File

Barrel file (`index.ts`) re-export từ nhiều module gây phân giải eager tất cả export, có thể kích hoạt import vòng. Import trực tiếp từ file nguồn:

```ts
import { UserService } from '../shared/user.service';  // an toàn
import { UserService } from '../shared';                // barrel rủi ro
```

### Pattern SharedModule

Nhóm service stateless vào `SharedModule` thay vì nhân bản provider:

```ts
@Module({
  imports: [DatabaseModule, CacheModule],
  providers: [UserService, ProductService],
  exports: [UserService, ProductService],
})
export class SharedModule {}
```

### forwardRef — Biện pháp cuối cùng

`forwardRef()` là dấu hiệu code cho thấy hai module phụ thuộc lẫn nhau. Ưu tiên:

1. Tách logic chung vào module thứ ba
2. Sử dụng event (`EventBusModule`) để giảm ghép nối
3. Sử dụng contract (`createContract`) cho injection dựa trên interface

### Cách createApp() ngăn Circular Dep

- Module hạ tầng là `@Global()` và đăng ký một lần ở root
- Không chia sẻ provider giữa module
- Config được tập trung trong `BootConfigModule`
- Guard và interceptor là global qua `app.useGlobalInterceptors()`

Debug với: `NEST_DEBUG=true npm run start:dev`
