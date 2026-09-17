# Content Service — Product Specification

> **Status:** Finalized — Ready for implementation  
> **Owner:** nthanhdo  
> **Last updated:** 2026-09-17

---

## 1. Tổng quan

Content Service là một Headless CMS service, cho phép team nội dung quản lý content mà không cần dev can thiệp. Lấy cảm hứng từ Contentful, đơn giản hơn Strapi để vận hành, tối ưu cho hệ thống NestJS. Hướng tới mở rộng RAG trong tương lai.

### 1.1 Quyết định kiến trúc (đã chốt)

| Quyết định | Chi tiết |
|---|---|
| **Repo** | Nằm trong repo nestjs-boot, là một service module |
| **Standalone** | Clone repo → config `.env` chỉ bật content-service → chạy ngay, không cần load cả bộ |
| **Service ON/OFF** | Config qua `.env`, chỉ load module đang active |
| **Database** | PostgreSQL (phục vụ mở rộng RAG sau này) |
| **Cache** | Redis + Memcached, có cơ chế bật/tắt từng layer |
| **Search** | PostgreSQL full-text search (tối ưu tối đa, không dùng external engine) |
| **File Storage** | Cloudflare R2 hoặc AWS S3 (config chọn 1 trong 2) |
| **API** | REST + GraphQL cho Delivery API |
| **Delivery API Auth** | Bắt buộc API key |
| **Web UI** | Repo riêng (Next.js + React), phase riêng. Repo này chỉ có Mock UI (HTML) để demo |
| **Localization** | EN + VI (mở rộng thêm locale sau) |
| **Publishing** | Draft → Approved → Scheduled → Published |
| **Content Type** | PO/BA + custom define qua API (không cần dev) |
| **Nested Components** | Có — reusable components dùng chung giữa các content types |
| **Target Users** | Internal team + External customers |
| **Scale** | Load balancer adaptive, không fix cứng |
| **Config method** | `.env` file — no programmatic config |

### 1.2 Mục tiêu

- [x] PO/BA/Content Editor tự define content model (không cần dev)
- [x] Quản lý nội dung qua Management API + Mock UI demo
- [x] Deliver content qua REST + GraphQL API, cached
- [x] Clone source về chạy standalone content-service
- [x] Đơn giản hơn Strapi — chỉ cần `.env` & chạy
- [x] Sẵn sàng mở rộng RAG trên PostgreSQL

### 1.3 Đối tượng sử dụng

| Role | Mô tả | Quyền |
|---|---|---|
| **Admin** | Quản lý toàn bộ hệ thống | Full access |
| **Content Manager** | Define content type, quản lý workflow | Create/Edit content types, approve content |
| **Content Editor** | Tạo và chỉnh sửa nội dung | Create/Edit entries, submit for review |
| **Developer** | Tích hợp API, custom extensions | API access, webhook config |
| **Consumer (App/Web)** | Đọc content qua Delivery API | Read-only (API key required) |

---

## 2. Content Type (Content Model)

### 2.1 Field Types

| Field Type | Mô tả | MVP | Ghi chú |
|---|---|---|---|
| **Short Text** | String ngắn (title, slug, tag) | [x] | Max 255 chars |
| **Long Text** | Textarea thuần | [x] | Unlimited |
| **Rich Text** | Structured content editor | [x] | JSON-based (ProseMirror/TipTap format), render HTML on delivery |
| **Number** | Integer hoặc Float | [x] | Phân biệt integer/decimal |
| **Boolean** | True/False | [x] | |
| **Date** | Date hoặc DateTime | [x] | UTC storage, timezone display |
| **Media** | Reference tới asset | [x] | Link to Asset management |
| **JSON** | Raw JSON object | [x] | Schema validation optional |
| **Reference** | Link tới entry khác | [x] | One-to-one + One-to-many |
| **Enum / Dropdown** | Chọn từ danh sách định sẵn | [x] | Single + Multi select |
| **Slug** | Auto-generated from title | [x] | Configurable source field |
| **URL** | Validated URL | [x] | |
| **Email** | Validated email | [x] | |
| **Color** | Hex color picker | P2 | |
| **Location** | Lat/Lng | P2 | |
| **Component** | Reusable field group | [x] | Core feature — SEO block, CTA block, etc. |

### 2.2 Field Validation

| Validation | MVP | Ghi chú |
|---|---|---|
| **Required** | [x] | |
| **Unique** | [x] | Scope: per locale |
| **Min/Max Length** | [x] | For text fields |
| **Min/Max Value** | [x] | For number fields |
| **Regex Pattern** | [x] | Custom validation |
| **Allowed Values** | [x] | For enum fields |
| **Custom Validation** | P2 | Pluggable validator functions |

### 2.3 Content Type Features

| Feature | MVP | Ghi chú |
|---|---|---|
| **Reusable Components** | [x] | Group fields thành component dùng chung (SEO, CTA, Hero, etc.) |
| **Dynamic field ordering** | [x] | Sắp xếp thứ tự field |
| **Field grouping / tabs** | P2 | Nhóm fields thành tab |
| **Conditional fields** | P2 | Hiện/ẩn dựa trên field khác |
| **Content Type versioning** | [x] | Track schema changes, auto-migration |
| **Content Type inheritance** | P2 | |

---

## 3. Entry Management (Nội dung)

### 3.1 CRUD Operations

| Operation | MVP | Ghi chú |
|---|---|---|
| **Create** | [x] | Auto-save as Draft |
| **Read** | [x] | |
| **Update** | [x] | Partial update supported |
| **Delete** | [x] | Soft delete (recoverable) |
| **Bulk operations** | P2 | Import/Export CSV + JSON |
| **Duplicate** | [x] | Clone within same locale |

### 3.2 Entry Versioning

| Feature | MVP | Ghi chú |
|---|---|---|
| **Version history** | [x] | Keep all versions (configurable retention) |
| **Diff / Compare** | P2 | |
| **Rollback** | [x] | Restore to any previous version |
| **Audit trail** | [x] | Tận dụng AuditModule có sẵn |

### 3.3 Relationships & References

| Feature | MVP | Ghi chú |
|---|---|---|
| **One-to-One** | [x] | |
| **One-to-Many** | [x] | Configurable max refs |
| **Many-to-Many** | [x] | Via junction |
| **Cross-content-type ref** | [x] | Restrict allowed target types |
| **Circular references** | [x] | Allowed, depth limit on delivery resolve |
| **Cascade behavior** | [x] | Warning on delete, configurable per field (restrict/set-null/cascade) |

---

## 4. Publishing Workflow (đã chốt)

### 4.1 State Machine

```
Draft → Approved → Scheduled → Published
  ↑        |                       |
  |        ↓                       ↓
  ←── Rejected              Unpublished → Archived
```

| State | Mô tả |
|---|---|
| **Draft** | Bản nháp, chỉ thấy trên Management API |
| **Approved** | Đã duyệt, sẵn sàng publish hoặc schedule |
| **Scheduled** | Hẹn giờ publish (auto-transition → Published tại thời điểm set) |
| **Published** | Live trên Delivery API |
| **Rejected** | Bị trả về, kèm lý do → quay lại Draft |
| **Unpublished** | Gỡ khỏi Delivery API, giữ data |
| **Archived** | Lưu trữ, không dùng nữa |

### 4.2 Workflow Rules

| Rule | MVP | Ghi chú |
|---|---|---|
| **Approval required before publish** | [x] | Configurable per content type |
| **Scheduled publish** | [x] | Cron job via BullMQ |
| **Scheduled unpublish** | [x] | Campaign expiry use case |
| **Reject with reason** | [x] | Required comment |
| **Comment / Note on transitions** | [x] | Audit trail |
| **Multi-level approval** | P2 | Editor → Manager → Admin |

---

## 5. Localization (đã chốt: EN + VI)

| Feature | MVP | Ghi chú |
|---|---|---|
| **Multi-locale** | [x] | EN (default) + VI. Thêm locale qua API |
| **Default locale** | [x] | EN |
| **Field-level localization** | [x] | Mark per field: localizable or not (slug: no, title: yes) |
| **Fallback locale** | [x] | Chain: VI → EN |
| **Translation status** | [x] | Track per field per locale |
| **Independent publishing** | [x] | Publish VI mà chưa publish EN được |
| **RTL support** | P2 | |

---

## 6. Media / Asset Management

| Feature | MVP | Ghi chú |
|---|---|---|
| **Upload** | [x] | Max 50MB configurable |
| **Storage backend** | [x] | R2 hoặc S3 — config chọn 1. Tận dụng StorageModule |
| **Allowed types** | [x] | Image (jpg, png, webp, svg), Video (mp4, webm), PDF, Doc |
| **Folder organization** | [x] | Virtual folders |
| **Tag** | [x] | Multiple tags per asset |
| **Alt text / Metadata** | [x] | Title, description, alt — localizable |
| **Image transformation** | P2 | On-the-fly resize/crop/format via CDN |
| **Duplicate detection** | P2 | Hash-based |
| **CDN delivery** | P2 | CloudFront or Cloudflare |

---

## 7. API Design

### 7.1 Management API (authed, JWT + RBAC)

| Endpoint | Method | Mô tả |
|---|---|---|
| `POST /api/content-types` | POST | Create content type |
| `GET /api/content-types` | GET | List content types |
| `GET /api/content-types/:id` | GET | Get content type detail + fields |
| `PUT /api/content-types/:id` | PUT | Update content type |
| `DELETE /api/content-types/:id` | DELETE | Soft delete content type |
| `POST /api/content-types/:id/fields` | POST | Add field to content type |
| `PUT /api/content-types/:id/fields/:fieldId` | PUT | Update field |
| `DELETE /api/content-types/:id/fields/:fieldId` | DELETE | Remove field |
| | | |
| `POST /api/components` | POST | Create reusable component |
| `GET /api/components` | GET | List components |
| `PUT /api/components/:id` | PUT | Update component |
| `DELETE /api/components/:id` | DELETE | Delete component |
| | | |
| `POST /api/entries` | POST | Create entry (auto Draft) |
| `GET /api/entries` | GET | List entries (filter: type, status, locale, search) |
| `GET /api/entries/:id` | GET | Get entry (include locale param) |
| `PUT /api/entries/:id` | PUT | Update entry (creates new version) |
| `DELETE /api/entries/:id` | DELETE | Soft delete |
| `POST /api/entries/:id/approve` | POST | Approve entry |
| `POST /api/entries/:id/reject` | POST | Reject with reason |
| `POST /api/entries/:id/publish` | POST | Publish immediately |
| `POST /api/entries/:id/schedule` | POST | Schedule publish (datetime) |
| `POST /api/entries/:id/unpublish` | POST | Unpublish |
| `POST /api/entries/:id/archive` | POST | Archive |
| `GET /api/entries/:id/versions` | GET | List versions |
| `POST /api/entries/:id/versions/:v/restore` | POST | Rollback to version |
| | | |
| `POST /api/assets` | POST | Upload asset (multipart) |
| `GET /api/assets` | GET | List assets (filter: type, folder, tag) |
| `GET /api/assets/:id` | GET | Get asset detail |
| `PUT /api/assets/:id` | PUT | Update metadata |
| `DELETE /api/assets/:id` | DELETE | Delete asset |
| | | |
| `GET /api/locales` | GET | List configured locales |
| `POST /api/locales` | POST | Add locale |
| `DELETE /api/locales/:code` | DELETE | Remove locale |
| | | |
| `GET /api/webhooks` | GET | List webhooks |
| `POST /api/webhooks` | POST | Create webhook |
| `PUT /api/webhooks/:id` | PUT | Update webhook |
| `DELETE /api/webhooks/:id` | DELETE | Delete webhook |
| `GET /api/webhooks/:id/logs` | GET | Webhook delivery logs |

### 7.2 Delivery API (read-only, API key required)

| Endpoint | Method | Mô tả |
|---|---|---|
| `GET /delivery/entries` | GET | List published entries |
| `GET /delivery/entries/:id` | GET | Get published entry |
| `GET /delivery/entries/by-slug/:slug` | GET | Get by slug |
| `GET /delivery/content-types` | GET | List content type schemas |
| `GET /delivery/assets/:id` | GET | Get asset URL + metadata |
| `POST /graphql` | POST | GraphQL endpoint (auto-generated schema from content types) |

**Delivery API Query Features:**
- Filtering: `?filters[field][operator]=value` (eq, ne, gt, lt, gte, lte, in, contains, startsWith)
- Sorting: `?sort=field:asc,field2:desc`
- Pagination: `?page=1&pageSize=25` (offset) or `?cursor=xxx&limit=25` (cursor)
- Populate references: `?populate=author,category` or `?populate=*` (depth limit: 3)
- Field selection: `?fields=title,slug,publishedAt`
- Locale: `?locale=vi` (fallback to default if not translated)
- Preview mode: `?preview=true` (shows draft, requires preview API key)
- Cache: `Cache-Control` headers, configurable TTL per content type

---

## 8. Search & Filtering (PostgreSQL Full-Text Search)

| Feature | MVP | Ghi chú |
|---|---|---|
| **Full-text search** | [x] | `tsvector` + `tsquery`, GIN index |
| **Weighted search** | [x] | Title weight A, body weight B |
| **Trigram similarity** | [x] | `pg_trgm` for fuzzy/typo-tolerant search |
| **Unaccented search** | [x] | `unaccent` extension for Vietnamese diacritics |
| **Filter by field value** | [x] | JSONB operators |
| **Filter by status** | [x] | |
| **Filter by content type** | [x] | |
| **Filter by locale** | [x] | |
| **Filter by date range** | [x] | created / updated / published |
| **Filter by author** | [x] | |
| **Saved filters** | P2 | |

---

## 9. Webhooks & Events

| Event | MVP | Ghi chú |
|---|---|---|
| **entry.created** | [x] | |
| **entry.updated** | [x] | |
| **entry.published** | [x] | Trigger SSG rebuild, cache purge |
| **entry.unpublished** | [x] | |
| **entry.deleted** | [x] | |
| **entry.status_changed** | [x] | Any workflow transition |
| **content-type.created** | [x] | |
| **content-type.updated** | [x] | |
| **asset.uploaded** | [x] | |
| **asset.deleted** | [x] | |
| **Webhook retry** | [x] | 3 retries, exponential backoff (1s, 10s, 60s) |
| **Webhook log** | [x] | Keep 30 days |
| **Webhook signature** | [x] | HMAC-SHA256 for verification |

---

## 10. Multi-tenancy

> Tận dụng TenancyModule có sẵn

| Feature | MVP | Ghi chú |
|---|---|---|
| **Row-level isolation** | [x] | tenant_id column, default strategy |
| **Tenant-specific content types** | [x] | Mỗi tenant define riêng |
| **Tenant-specific API keys** | [x] | |
| **Shared components** | P2 | Global components dùng chung cross-tenant |
| **Cross-tenant reference** | P2 | |

---

## 11. Security & Access Control

| Feature | MVP | Ghi chú |
|---|---|---|
| **JWT auth (Management API)** | [x] | Tận dụng AuthModule |
| **API Key (Delivery API)** | [x] | Per environment (dev/staging/prod) |
| **RBAC** | [x] | Tận dụng RBAC module |
| **Content-type level permission** | [x] | Editor A chỉ sửa "Blog Post" |
| **Entry-level permission** | [x] | Owner-based (chỉ sửa entry mình tạo) |
| **Rate limiting** | [x] | Tận dụng ThrottlerModule |
| **Audit log** | [x] | Tận dụng AuditModule |
| **Field-level permission** | P2 | |
| **IP whitelist** | P2 | |

---

## 12. Performance & Scale

| Aspect | Strategy |
|---|---|
| **Caching** | L1 Memcached + L2 Redis (bật/tắt từng layer qua config) |
| **Delivery API cache** | Response cache with tag-based invalidation on publish |
| **Database** | PostgreSQL with read replicas (load balancer adaptive) |
| **Scale strategy** | Horizontal scaling, load balancer, stateless service |
| **Estimated locales** | 2 (EN + VI), extensible |
| **Connection pooling** | PgBouncer recommended for production |

---

## 13. UI Strategy (đã chốt)

| Aspect | Quyết định |
|---|---|
| **MVP** | API-first. Mock UI bằng HTML để demo |
| **Phase 2** | Full admin panel — repo riêng, Next.js + React |
| **Mock UI scope** | Content type builder demo, entry CRUD demo, asset upload demo |
| **Mock UI tech** | Static HTML + vanilla JS, served by NestJS static files |

---

## 14. Migration & Import/Export

| Feature | MVP | Ghi chú |
|---|---|---|
| **Import JSON** | [x] | Bulk import entries |
| **Export JSON** | [x] | Bulk export entries |
| **Content type export/import** | [x] | Schema portability, CI/CD |
| **Seed data** | [x] | Sample Blog Post, Product, FAQ content types + entries |
| **Import CSV** | P2 | |
| **Import from Contentful** | P2 | Migration tool |

---

## 15. Standalone Deployment & Service ON/OFF

### 15.1 Service ON/OFF Mechanism (đã chốt: `.env` config)

```bash
# .env — chỉ bật content-service
BOOT_SERVICES_CONTENT=true
# BOOT_SERVICES_AUTH=true     # uncomment nếu cần
# BOOT_SERVICES_QUEUE=true    # uncomment nếu cần

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/content

# Cache (optional — bật/tắt từng layer)
CACHE_REDIS_ENABLED=true
CACHE_REDIS_URL=redis://localhost:6379
CACHE_MEMCACHED_ENABLED=false
# CACHE_MEMCACHED_HOSTS=localhost:11211

# Storage
STORAGE_PROVIDER=s3          # s3 hoặc r2
STORAGE_BUCKET=my-assets
STORAGE_REGION=ap-southeast-1
STORAGE_ACCESS_KEY=xxx
STORAGE_SECRET_KEY=xxx
# STORAGE_R2_ACCOUNT_ID=xxx  # nếu dùng R2

# Delivery API
DELIVERY_API_KEY=your-api-key
DELIVERY_CACHE_TTL=300       # seconds

# Locales
CONTENT_DEFAULT_LOCALE=en
CONTENT_LOCALES=en,vi
```

| Rule | Ghi chú |
|---|---|
| `BOOT_SERVICES_*=true` → load module | Không khai báo = không load |
| Dependency auto-resolve | Content service tự require database; cache/queue optional |
| Startup log | Log rõ: `[Boot] Loaded: content, database. Skipped: auth, queue` |
| Health check | Chỉ check service đang active |

### 15.2 Standalone Deployment

| Deliverable | Ghi chú |
|---|---|
| **`.env.content-service.example`** | Template config tối thiểu, copy → fill → chạy |
| **`Dockerfile`** | Multi-stage build, tối ưu cho content-service standalone |
| **`docker-compose.yml`** | PostgreSQL + Redis + content-service, 1 lệnh up |
| **Seed data** | `npx nestjs-boot seed --service content` |
| **README** | Clone → chạy trong < 5 phút |

### 15.3 README Content (đã chốt)

| Section | Nội dung |
|---|---|
| **What is this** | Headless CMS, simpler than Strapi, powered by nestjs-boot |
| **Features** | Full feature list |
| **Quick Start** | 5-minute guide: clone, env, docker-compose up |
| **Prerequisites** | Node.js 18+, Docker (hoặc PostgreSQL + Redis thủ công) |
| **Configuration** | Giải thích mọi env var |
| **API Reference** | Swagger UI auto-generated |
| **Content Type Examples** | Blog Post, Product, FAQ |
| **Deployment** | Docker, docker-compose, K8s helm chart (P2) |
| **Architecture** | Service diagram |
| **vs Strapi** | Comparison table |

---

## 16. MVP Scope (đã chốt)

### MVP (Phase 1):

- [x] Content Type Builder (API + reusable components)
- [x] Entry CRUD (API + versioning + soft delete)
- [x] Publishing workflow (Draft → Approved → Scheduled → Published)
- [x] REST + GraphQL Delivery API (cached, API key auth)
- [x] Localization (EN + VI, field-level, fallback)
- [x] PostgreSQL full-text search (tsvector, trigram, unaccent)
- [x] Media/Asset management (R2/S3)
- [x] Webhooks (all events, retry, signature)
- [x] Multi-tenancy (row-level)
- [x] Security (JWT, API key, RBAC, content-type permissions)
- [x] Service ON/OFF via `.env`
- [x] Docker-compose standalone
- [x] Seed data + Mock UI (HTML demo)
- [x] README standalone guide

### Phase 2:

- [ ] Full admin panel (Next.js + React, repo riêng)
- [ ] Image transformation on-the-fly
- [ ] CDN integration (CloudFront/Cloudflare)
- [ ] Multi-level approval workflow
- [ ] Field-level permissions
- [ ] Saved filters
- [ ] Import from Contentful migration
- [ ] CSV import/export
- [ ] Conditional fields
- [ ] Content Type inheritance
- [ ] K8s Helm chart
- [ ] RAG integration (pgvector)

---

## 17. Sign-off

| Role | Name | Date | Status |
|---|---|---|---|
| PO/Owner | nthanhdo | 2026-09-17 | [x] Approved |
| BA | | | [ ] Approved |
| Tech Lead | | | [ ] Approved |
| Dev Lead | | | [ ] Approved |
