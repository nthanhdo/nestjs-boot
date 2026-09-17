# Content Service — Product Specification

> **Status:** Draft — Cần PO/BA review & define trước khi dev  
> **Owner:** _(PO/BA fill)_  
> **Last updated:** 2026-09-17

---

## 1. Tổng quan

Content Service là một Headless CMS service, cho phép team nội dung quản lý content mà không cần dev can thiệp. Lấy cảm hứng từ Contentful, tối ưu cho hệ thống NestJS.

### 1.1 Mục tiêu

- [ ] PO/BA/Content Editor tự define content model (không cần dev)
- [ ] Quản lý nội dung qua Management API (và UI nếu có)
- [ ] Deliver content qua read-only API, tối ưu performance
- [ ] _(Thêm mục tiêu khác...)_

### 1.2 Đối tượng sử dụng

| Role | Mô tả | Quyền |
|---|---|---|
| **Admin** | Quản lý toàn bộ hệ thống | Full access |
| **Content Manager** | Define content type, quản lý workflow | Create/Edit content types, approve content |
| **Content Editor** | Tạo và chỉnh sửa nội dung | Create/Edit entries, submit for review |
| **Developer** | Tích hợp API, custom extensions | API access, webhook config |
| **Consumer (App/Web)** | Đọc content qua Delivery API | Read-only |
| _(Thêm role khác...)_ | | |

---

## 2. Content Type (Content Model)

> PO/BA define: Hệ thống cần hỗ trợ những loại field nào?

### 2.1 Field Types

| Field Type | Mô tả | Cần? | Ghi chú |
|---|---|---|---|
| **Short Text** | String ngắn (title, slug, tag) | [ ] | Max length? |
| **Long Text** | Textarea thuần | [ ] | Max length? |
| **Rich Text** | HTML/Markdown editor | [ ] | Format nào? (HTML / Markdown / JSON-based như ProseMirror) |
| **Number** | Integer hoặc Float | [ ] | Có cần phân biệt int/float? |
| **Boolean** | True/False | [ ] | |
| **Date** | Date hoặc DateTime | [ ] | Timezone handling? |
| **Media** | Ảnh, video, file | [ ] | Max size? Allowed types? |
| **Location** | Lat/Lng | [ ] | |
| **JSON** | Raw JSON object | [ ] | |
| **Reference** | Link tới entry khác | [ ] | One-to-one? One-to-many? |
| **Enum / Dropdown** | Chọn từ danh sách định sẵn | [ ] | Single select hay multi? |
| **Color** | Hex color picker | [ ] | |
| **URL** | Validated URL | [ ] | |
| **Email** | Validated email | [ ] | |
| **Slug** | Auto-generated from title | [ ] | Auto-gen rule? |
| _(Thêm field type khác...)_ | | [ ] | |

### 2.2 Field Validation

| Validation | Mô tả | Cần? | Ghi chú |
|---|---|---|---|
| **Required** | Bắt buộc nhập | [ ] | |
| **Unique** | Không trùng trong cùng content type | [ ] | Scope: per locale hay global? |
| **Min/Max Length** | Giới hạn ký tự | [ ] | |
| **Min/Max Value** | Giới hạn số | [ ] | |
| **Regex Pattern** | Custom pattern | [ ] | |
| **Allowed Values** | Whitelist giá trị | [ ] | |
| **Custom Validation** | Logic tùy chỉnh | [ ] | Cần đến mức nào? |
| _(Thêm...)_ | | [ ] | |

### 2.3 Content Type Features

| Feature | Mô tả | Cần? | Ghi chú |
|---|---|---|---|
| **Nested fields / Component** | Group fields thành component tái sử dụng | [ ] | Ví dụ: SEO block (title + desc + image) dùng chung |
| **Content Type inheritance** | Type con kế thừa fields từ type cha | [ ] | |
| **Dynamic field ordering** | Sắp xếp thứ tự field hiển thị | [ ] | |
| **Field grouping / tabs** | Nhóm fields thành tab trên UI | [ ] | |
| **Conditional fields** | Hiện/ẩn field dựa trên giá trị field khác | [ ] | |
| **Versioning content type** | Track thay đổi schema theo version | [ ] | Migration strategy khi schema thay đổi? |
| _(Thêm...)_ | | [ ] | |

---

## 3. Entry Management (Nội dung)

### 3.1 CRUD Operations

| Operation | Mô tả | Cần? | Ghi chú |
|---|---|---|---|
| **Create** | Tạo entry mới | [ ] | Auto-save draft? |
| **Read** | Xem entry | [ ] | |
| **Update** | Chỉnh sửa entry | [ ] | Partial update? |
| **Delete** | Xóa entry | [ ] | Soft delete hay hard delete? |
| **Bulk operations** | Tạo/sửa/xóa nhiều entry cùng lúc | [ ] | Import CSV/JSON? |
| **Duplicate** | Clone entry | [ ] | Cross-locale clone? |
| _(Thêm...)_ | | [ ] | |

### 3.2 Entry Versioning

| Feature | Mô tả | Cần? | Ghi chú |
|---|---|---|---|
| **Version history** | Lưu lịch sử mọi thay đổi | [ ] | Giữ bao nhiêu version? |
| **Diff / Compare** | So sánh 2 version | [ ] | |
| **Rollback** | Quay lại version cũ | [ ] | |
| **Who changed what** | Audit trail per field | [ ] | Đã có AuditModule trong nestjs-boot |
| _(Thêm...)_ | | [ ] | |

### 3.3 Relationships & References

| Feature | Mô tả | Cần? | Ghi chú |
|---|---|---|---|
| **One-to-One** | Entry A link tới 1 Entry B | [ ] | |
| **One-to-Many** | Entry A link tới nhiều Entry B | [ ] | Max references? |
| **Many-to-Many** | Nhiều-nhiều | [ ] | |
| **Circular references** | A → B → A | [ ] | Có cho phép? Depth limit? |
| **Cross-content-type ref** | Ref giữa các content type khác nhau | [ ] | Restrict allowed types? |
| **Cascade delete** | Xóa entry → xóa entries ref tới nó? | [ ] | Hay chỉ warning? |
| _(Thêm...)_ | | [ ] | |

---

## 4. Publishing Workflow

> PO/BA define: Flow duyệt nội dung như thế nào?

### 4.1 Trạng thái (States)

| State | Mô tả | Cần? | Ghi chú |
|---|---|---|---|
| **Draft** | Bản nháp, chưa publish | [ ] | |
| **In Review** | Chờ duyệt | [ ] | Ai duyệt? 1 người hay nhiều người? |
| **Approved** | Đã duyệt, chờ publish | [ ] | Có cần tách approved vs published? |
| **Published** | Đã live, hiển thị trên Delivery API | [ ] | |
| **Unpublished** | Gỡ khỏi Delivery API nhưng giữ data | [ ] | |
| **Archived** | Lưu trữ, không dùng nữa | [ ] | |
| **Scheduled** | Hẹn giờ publish | [ ] | |
| _(Custom states?)_ | | [ ] | Có cần custom workflow per content type? |

### 4.2 Workflow Rules

| Rule | Mô tả | Cần? | Ghi chú |
|---|---|---|---|
| **Approval required** | Bắt buộc duyệt trước khi publish | [ ] | Tất cả content type hay chỉ một số? |
| **Multi-level approval** | Duyệt nhiều cấp (Editor → Manager → Admin) | [ ] | Bao nhiêu cấp? |
| **Auto-publish** | Tự publish sau khi approved | [ ] | |
| **Scheduled publish** | Hẹn ngày/giờ publish | [ ] | Timezone nào? |
| **Scheduled unpublish** | Hẹn ngày/giờ gỡ | [ ] | Use case: campaign hết hạn |
| **Comment / Note** | Ghi chú khi duyệt/reject | [ ] | |
| **Reject with reason** | Trả về kèm lý do | [ ] | |
| _(Thêm...)_ | | [ ] | |

---

## 5. Localization (Đa ngôn ngữ)

| Feature | Mô tả | Cần? | Ghi chú |
|---|---|---|---|
| **Multi-locale** | Hỗ trợ nhiều ngôn ngữ | [ ] | Những locale nào? (vi, en, ja, ...) |
| **Default locale** | Ngôn ngữ mặc định | [ ] | Locale nào? |
| **Field-level localization** | Chỉ một số field cần dịch (title: có, slug: không) | [ ] | Hay tất cả field đều localized? |
| **Fallback locale** | Nếu chưa dịch → dùng locale khác | [ ] | Fallback chain? (ja → en → vi) |
| **Translation status** | Track field nào đã dịch / chưa | [ ] | |
| **Independent publishing** | Publish locale vi mà chưa publish en | [ ] | Hay phải publish tất cả cùng lúc? |
| **RTL support** | Hỗ trợ ngôn ngữ viết phải-qua-trái | [ ] | Arabic, Hebrew? |
| _(Thêm...)_ | | [ ] | |

---

## 6. Media / Asset Management

| Feature | Mô tả | Cần? | Ghi chú |
|---|---|---|---|
| **Upload** | Upload file | [ ] | Max size? (ví dụ: 50MB) |
| **Allowed types** | Image, Video, PDF, ... | [ ] | Whitelist MIME types? |
| **Image transformation** | Resize, crop, format convert | [ ] | On-the-fly hay pre-generate? |
| **CDN delivery** | Serve qua CDN | [ ] | Provider nào? (CloudFront, Cloudflare) |
| **Folder / Tag** | Tổ chức asset theo folder hoặc tag | [ ] | |
| **Alt text / Metadata** | SEO metadata cho media | [ ] | Required? |
| **Duplicate detection** | Phát hiện file trùng | [ ] | |
| **Storage backend** | S3 / GCS / Local | [ ] | Đã có StorageModule trong nestjs-boot |
| _(Thêm...)_ | | [ ] | |

---

## 7. API Design

### 7.1 Management API (CRUD, authed)

> PO/BA define: API cần hỗ trợ những gì?

| Endpoint | Method | Mô tả | Cần? |
|---|---|---|---|
| `/content-types` | GET | List all content types | [ ] |
| `/content-types` | POST | Create content type | [ ] |
| `/content-types/:id` | GET | Get content type detail | [ ] |
| `/content-types/:id` | PUT | Update content type | [ ] |
| `/content-types/:id` | DELETE | Delete content type | [ ] |
| `/entries` | GET | List entries (filter by type, status, locale) | [ ] |
| `/entries` | POST | Create entry | [ ] |
| `/entries/:id` | GET | Get entry | [ ] |
| `/entries/:id` | PUT | Update entry | [ ] |
| `/entries/:id` | DELETE | Delete entry | [ ] |
| `/entries/:id/publish` | POST | Publish entry | [ ] |
| `/entries/:id/unpublish` | POST | Unpublish entry | [ ] |
| `/entries/:id/archive` | POST | Archive entry | [ ] |
| `/entries/:id/versions` | GET | List versions | [ ] |
| `/entries/:id/versions/:v` | GET | Get specific version | [ ] |
| `/assets` | GET/POST | List/Upload assets | [ ] |
| `/assets/:id` | GET/PUT/DELETE | Asset CRUD | [ ] |
| `/locales` | GET/POST | Manage locales | [ ] |
| _(Thêm...)_ | | | [ ] |

### 7.2 Delivery API (Read-only, public hoặc API key)

| Feature | Mô tả | Cần? | Ghi chú |
|---|---|---|---|
| **REST** | JSON REST API | [ ] | |
| **GraphQL** | GraphQL query | [ ] | Auto-generate schema từ content types? |
| **Filtering** | Filter by field values | [ ] | Operators: eq, ne, gt, lt, in, contains? |
| **Sorting** | Sort by field | [ ] | Multi-field sort? |
| **Pagination** | Offset hoặc cursor | [ ] | Default page size? |
| **Include / Populate** | Resolve references trong 1 request | [ ] | Max depth? |
| **Field selection** | Chỉ trả về fields cần thiết | [ ] | |
| **Preview API** | Xem draft content (chưa publish) | [ ] | Auth required cho preview? |
| **CDN caching** | Cache-Control headers | [ ] | TTL bao lâu? |
| _(Thêm...)_ | | [ ] | |

---

## 8. Search & Filtering

| Feature | Mô tả | Cần? | Ghi chú |
|---|---|---|---|
| **Full-text search** | Tìm kiếm trong content | [ ] | Engine: MongoDB text / Elasticsearch / Meilisearch? |
| **Filter by field** | Lọc theo giá trị field | [ ] | |
| **Filter by status** | Lọc theo trạng thái | [ ] | |
| **Filter by content type** | Lọc theo loại content | [ ] | |
| **Filter by locale** | Lọc theo ngôn ngữ | [ ] | |
| **Filter by date range** | Lọc theo khoảng thời gian | [ ] | created / updated / published? |
| **Filter by author** | Lọc theo người tạo | [ ] | |
| **Saved filters** | Lưu bộ lọc để dùng lại | [ ] | |
| _(Thêm...)_ | | [ ] | |

---

## 9. Webhooks & Events

| Event | Mô tả | Cần? | Ghi chú |
|---|---|---|---|
| **entry.created** | Khi entry mới được tạo | [ ] | |
| **entry.updated** | Khi entry bị sửa | [ ] | |
| **entry.published** | Khi entry được publish | [ ] | Trigger rebuild SSG? |
| **entry.unpublished** | Khi entry bị gỡ | [ ] | |
| **entry.deleted** | Khi entry bị xóa | [ ] | |
| **entry.archived** | Khi entry bị archive | [ ] | |
| **content-type.created** | Khi tạo content type mới | [ ] | |
| **content-type.updated** | Khi sửa content type | [ ] | |
| **asset.uploaded** | Khi upload media | [ ] | |
| **asset.deleted** | Khi xóa media | [ ] | |
| **Webhook retry** | Retry khi gửi webhook thất bại | [ ] | Bao nhiêu lần? Backoff strategy? |
| **Webhook log** | Lưu log gửi webhook | [ ] | Giữ bao lâu? |
| _(Thêm...)_ | | [ ] | |

---

## 10. Multi-tenancy

> Đã có TenancyModule trong nestjs-boot

| Feature | Mô tả | Cần? | Ghi chú |
|---|---|---|---|
| **Tenant isolation** | Mỗi tenant có content riêng | [ ] | Row / Schema / Database? |
| **Shared content types** | Content type dùng chung cross-tenant | [ ] | Hay mỗi tenant define riêng? |
| **Tenant-specific locales** | Mỗi tenant có locale riêng | [ ] | |
| **Cross-tenant reference** | Ref content giữa các tenant | [ ] | |
| _(Thêm...)_ | | [ ] | |

---

## 11. Security & Access Control

| Feature | Mô tả | Cần? | Ghi chú |
|---|---|---|---|
| **API Key per environment** | Key riêng cho dev/staging/prod | [ ] | |
| **Role-based access** | Phân quyền theo role | [ ] | Đã có RBAC trong nestjs-boot |
| **Content-type level permission** | Phân quyền per content type | [ ] | Ví dụ: Editor A chỉ sửa "Blog Post" |
| **Field-level permission** | Ẩn/readonly một số field với role nhất định | [ ] | |
| **Entry-level permission** | Chỉ sửa entry do mình tạo | [ ] | |
| **IP whitelist** | Giới hạn IP cho Management API | [ ] | |
| **Rate limiting** | Giới hạn request | [ ] | Đã có ThrottlerModule |
| **Audit log** | Log mọi thay đổi | [ ] | Đã có AuditModule |
| _(Thêm...)_ | | [ ] | |

---

## 12. Performance & Scale

| Feature | Mô tả | Cần? | Ghi chú |
|---|---|---|---|
| **Response caching** | Cache Delivery API responses | [ ] | Đã có CacheModule (L1 + L2) |
| **CDN integration** | Cache tại edge | [ ] | Purge on publish? |
| **Estimated entries** | Dự kiến bao nhiêu entries? | | _(Fill: 1K / 10K / 100K / 1M+)_ |
| **Estimated content types** | Dự kiến bao nhiêu content types? | | _(Fill: 5 / 20 / 50+)_ |
| **Estimated request/sec** | Traffic Delivery API? | | _(Fill: 10 / 100 / 1K / 10K+)_ |
| **Estimated locales** | Bao nhiêu ngôn ngữ? | | _(Fill số)_ |
| _(Thêm...)_ | | | |

---

## 13. UI / Admin Panel

> Có cần UI hay chỉ API-only?

| Feature | Mô tả | Cần? | Ghi chú |
|---|---|---|---|
| **Admin panel** | Web UI quản lý content | [ ] | Build custom hay dùng framework? |
| **Content type builder UI** | Drag-drop define fields | [ ] | |
| **Rich text editor** | WYSIWYG editor | [ ] | TipTap / Slate / ProseMirror? |
| **Media library UI** | Browse/upload media | [ ] | |
| **Preview** | Xem trước content trên frontend | [ ] | Iframe preview? |
| **Activity feed** | Xem ai làm gì gần đây | [ ] | |
| **Dark mode** | Hỗ trợ dark mode | [ ] | |
| _(Thêm...)_ | | [ ] | |

---

## 14. Migration & Import/Export

| Feature | Mô tả | Cần? | Ghi chú |
|---|---|---|---|
| **Import from Contentful** | Migration tool từ Contentful | [ ] | |
| **Import CSV/JSON** | Bulk import entries | [ ] | |
| **Export CSV/JSON** | Bulk export entries | [ ] | |
| **Content type export** | Export schema definitions | [ ] | Dùng cho CI/CD? |
| **Seed data** | Sample data cho dev/staging | [ ] | |
| _(Thêm...)_ | | [ ] | |

---

## 15. Câu hỏi mở cho PO/BA

> Trả lời những câu hỏi này trước khi dev bắt tay vào làm:

1. **Database engine?** MongoDB hay PostgreSQL? (nestjs-boot hỗ trợ cả 2)
2. **GraphQL có cần không?** Hay REST là đủ?
3. **Ai là user chính?** Internal team hay external customers?
4. **Content type do ai define?** Dev define trong code, hay PO/BA tự define qua UI/API?
5. **Scale dự kiến?** Bao nhiêu content types, entries, locales, traffic?
6. **Deployment model?** Module trong monolith, hay standalone microservice?
7. **UI priority?** API-first rồi build UI sau, hay cần UI ngay từ đầu?
8. **Timeline?** MVP cần những feature nào? Phase 2 là gì?
9. **Existing content?** Có cần migrate data từ hệ thống cũ không?
10. **Budget cho 3rd party?** Có dùng Elasticsearch, CDN, hay chỉ dùng những gì có sẵn?

---

## 16. MVP Scope (PO/BA define)

> Đánh dấu những feature cần có cho MVP:

- [ ] _(List features cho MVP ở đây)_
- [ ] 
- [ ] 

### Phase 2:

- [ ] _(List features cho Phase 2)_
- [ ] 
- [ ] 

---

## Sign-off

| Role | Name | Date | Status |
|---|---|---|---|
| PO | | | [ ] Approved |
| BA | | | [ ] Approved |
| Tech Lead | | | [ ] Approved |
| Dev Lead | | | [ ] Approved |
