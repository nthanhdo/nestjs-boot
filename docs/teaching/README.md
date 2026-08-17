# Backend Engineering với nestjs-boot

> Khóa học 16 tuần dành cho sinh viên CNTT năm 3-4 và fresher developer

## Giới thiệu

Khóa học này dạy Backend Engineering **từ production code thật**, không phải từ TODO app. Mỗi tuần map trực tiếp với 1 module trong [nestjs-boot](https://github.com/nthanhdo/nestjs-boot) — framework NestJS với 55+ modules, 495 tests, CI/CD pipeline hoàn chỉnh.

**Giảng viên:** Nguyễn Thanh Đô — Backend Tech Lead, 11+ năm kinh nghiệm

## Triết lý giảng dạy

1. **Code trước, lý thuyết sau** — chạy code thấy kết quả, rồi mới giải thích tại sao
2. **Demo lỗi, không chỉ demo đúng** — show injection, crash, security hole → nhớ lâu hơn
3. **Đọc production code** — mỗi tuần đọc module thật, không chỉ viết tutorial
4. **Review code nhau** — PR vào repo chung, review bạn trước khi merge
5. **Hỏi "tại sao" trước "làm thế nào"** — hiểu vấn đề trước giải pháp
6. **Không skip security** — mọi API phải có guard, mọi input phải validate

## Yêu cầu đầu vào

- Biết lập trình cơ bản (biến, hàm, vòng lặp, OOP cơ bản)
- Có máy tính cá nhân (Windows/Mac/Linux)
- Tài khoản GitHub
- Tiếng Anh đọc hiểu cơ bản (đọc docs, error messages)

## Cài đặt trước khóa học

```bash
# Node.js 20+ (dùng nvm)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.0/install.sh | bash
nvm install 20

# Docker Desktop
# Download từ https://www.docker.com/products/docker-desktop/

# Git
# Download từ https://git-scm.com/downloads

# VS Code + Extensions
# - ESLint
# - Prettier
# - REST Client (hoặc dùng Postman)
# - MongoDB for VS Code

# Clone nestjs-boot (tài liệu tham khảo)
git clone https://github.com/nthanhdo/nestjs-boot.git
```

## Lộ trình 16 tuần

### Giai đoạn 1: Nền tảng (Tuần 1–4)

> Mục tiêu: Tự build được 1 CRUD API hoàn chỉnh với database

| Tuần | Chủ đề | Module nestjs-boot | Bài nộp |
|------|--------|-------------------|---------|
| [Tuần 1](stage-1-fundamentals/week-01-typescript-nestjs.md) | TypeScript & NestJS Core | `src/config/`, `src/common/` | Students module |
| [Tuần 2](stage-1-fundamentals/week-02-database-repository.md) | Database & Repository Pattern | `src/database/` | CRUD + MongoDB |
| [Tuần 3](stage-1-fundamentals/week-03-api-design.md) | API Design & Validation | `src/common/`, `src/swagger/` | REST API + Swagger |
| [Tuần 4](stage-1-fundamentals/week-04-config-environment.md) | Config & Environment | `src/config/` | **Milestone 1** |

### Giai đoạn 2: Trung cấp (Tuần 5–8)

> Mục tiêu: API có bảo mật, performance, và kiểm thử

| Tuần | Chủ đề | Module nestjs-boot | Bài nộp |
|------|--------|-------------------|---------|
| [Tuần 5](stage-2-intermediate/week-05-authentication.md) | Authentication & Authorization | `src/auth/` | JWT + RBAC |
| [Tuần 6](stage-2-intermediate/week-06-caching.md) | Caching & Performance | `src/cache/` | Redis cache + benchmark |
| [Tuần 7](stage-2-intermediate/week-07-testing.md) | Testing | `src/testing/`, `tests/` | 80% coverage |
| [Tuần 8](stage-2-intermediate/week-08-error-resilience.md) | Error Handling & Resilience | `src/resilience/`, `src/health/` | **Milestone 2** |

### Giai đoạn 3: Nâng cao (Tuần 9–12)

> Mục tiêu: Hiểu hệ thống phân tán, async processing

| Tuần | Chủ đề | Module nestjs-boot | Bài nộp |
|------|--------|-------------------|---------|
| [Tuần 9](stage-3-advanced/week-09-microservices.md) | Microservices | `src/transport/`, `src/rpc/` | 2 services + gRPC |
| [Tuần 10](stage-3-advanced/week-10-queue.md) | Message Queue | `src/queue/` | BullMQ workers |
| [Tuần 11](stage-3-advanced/week-11-events-cqrs.md) | Events & CQRS | `src/events/`, `src/cqrs/` | Event-driven flow |
| [Tuần 12](stage-3-advanced/week-12-observability.md) | Observability | `src/metrics/`, `src/tracing/` | **Milestone 3** |

### Giai đoạn 4: Production (Tuần 13–16)

> Mục tiêu: Đưa code lên production, biết debug, sẵn sàng đi làm

| Tuần | Chủ đề | Module nestjs-boot | Bài nộp |
|------|--------|-------------------|---------|
| [Tuần 13](stage-4-production/week-13-cicd-devops.md) | CI/CD & DevOps | `.github/workflows/` | Docker + CI |
| [Tuần 14](stage-4-production/week-14-security.md) | Security | `src/storage/`, `src/auth/` | CTF exercises |
| [Tuần 15](stage-4-production/week-15-performance.md) | Performance & System Design | `src/database/`, `src/cache/` | Load test report |
| [Tuần 16](stage-4-production/week-16-capstone.md) | Capstone & Career | Toàn bộ | **Final Project** |

## Đánh giá

| Thành phần | Tỷ trọng | Hình thức |
|------------|----------|-----------|
| Bài tập hàng tuần | 30% | Code + test, nộp qua GitHub PR |
| Milestone 1 (tuần 4) | 10% | CRUD API hoàn chỉnh |
| Milestone 2 (tuần 8) | 15% | Auth + Cache + Tests |
| Milestone 3 (tuần 12) | 15% | Microservices + Observability |
| Capstone (tuần 16) | 25% | Hệ thống hoàn chỉnh + demo |
| Tham gia lớp | 5% | Hỏi/trả lời, review code bạn |

## Cấu trúc mỗi buổi học (90 phút — buổi tối)

| Thời gian | Phần | Nội dung |
|-----------|------|----------|
| 0:00–0:10 | Warm-up | Ôn bài tuần trước + quiz nhanh + review homework |
| 0:10–0:25 | Lý thuyết 1 | Khái niệm cốt lõi — WHY trước HOW |
| 0:25–0:40 | Lý thuyết 2 | Đi sâu — code demo live |
| 0:40–0:55 | Lý thuyết 3 | Pattern thực tế từ nestjs-boot source |
| 0:55–1:00 | Nghỉ 5 phút | — |
| 1:00–1:25 | Thực hành | Coding exercise có hướng dẫn step-by-step |
| 1:25–1:30 | Wrap-up | Tóm tắt 3 điểm + giao bài tập + preview tuần sau |

> Template chuẩn cho mỗi bài: [LESSON-TEMPLATE.md](LESSON-TEMPLATE.md)

## Sau khóa học

Sinh viên có thể:
- Build và deploy backend API production-ready
- Đọc hiểu codebase thật (không chỉ tutorial)
- Phỏng vấn vị trí Backend Developer / Junior Backend Engineer
- Contribute vào open-source projects
- Tự học thêm: Go, Kubernetes, System Design
