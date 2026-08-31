# User Management

> **TL;DR** — The Backend Core template provides a complete user management module: CRUD, RBAC-gated endpoints, privilege boundary enforcement, and audit logging. Customize by modifying the template files. This guide covers what ships out of the box and what you need to add yourself.

## What the template provides

The `templates/backend-core/src/users/` module includes:

| Capability | Implementation |
|---|---|
| **CRUD** | `UsersService` with `findAll`, `findById`, `create`, `update`, `delete` |
| **RBAC** | Every endpoint gated with `@Permissions('user.read')`, etc. |
| **Privilege boundary** | Cannot delete users with higher-level roles (admin/super_admin check) |
| **Role assignment** | `POST /users/:id/roles` and `DELETE /users/:id/roles/:roleCode` |
| **Audit trail** | Role assignment/removal logged via `AuditService` |
| **Scope-based access** | `@RequireScope(AccessScope.ORGANIZATION)` on list and delete endpoints |
| **Pagination** | Query params `page`, `limit`, `sort` via `PaginationDto` |
| **Password hashing** | bcrypt with salt rounds 12 |
| **Soft delete** | `delete` sets `status: 'INACTIVE'` rather than removing the record |

## Reading order

To understand the user management module, read files in this order:

1. **`prisma/schema.prisma`** — User, Role, UserRole, Permission models and their relations
2. **`prisma/seed.ts`** — Default roles (SUPER_ADMIN through USER), permissions (14 codes), role-permission matrix, and role hierarchy
3. **`src/users/dto/user.dto.ts`** — `CreateUserDto`, `UpdateUserDto`, `AssignRoleDto` with class-validator decorators
4. **`src/users/users.service.ts`** — Business logic including privilege boundary checks
5. **`src/users/users.controller.ts`** — REST endpoints with permission and scope decorators

## Endpoints

| Method | Path | Permission | Scope | Description |
|---|---|---|---|---|
| `GET` | `/users` | `user.read` | ORGANIZATION | List users with pagination |
| `GET` | `/users/:id` | `user.read` | — | Get user by ID (with roles and memberships) |
| `POST` | `/users` | `user.create` | — | Create user (optional role assignment) |
| `PATCH` | `/users/:id` | `user.update` | — | Update name or status |
| `DELETE` | `/users/:id` | `user.delete` | ORGANIZATION | Soft-delete (deactivate) |
| `POST` | `/users/:id/roles` | `role.manage` | — | Assign a role |
| `DELETE` | `/users/:id/roles/:roleCode` | `role.manage` | — | Remove a role |

## How to customize

### Add fields

1. Add columns to the `User` model in `prisma/schema.prisma`:
   ```prisma
   model User {
     // existing fields...
     phone    String?
     timezone String  @default("UTC")
     avatar   String?
   }
   ```

2. Run `npx prisma migrate dev --name add-user-fields`.

3. Update `CreateUserDto` and `UpdateUserDto` with matching validation:
   ```ts
   @IsOptional()
   @IsString()
   phone?: string;

   @IsOptional()
   @IsString()
   timezone?: string;
   ```

4. Update `select` clauses in `UsersService.findAll()` and `findById()` to include new fields.

### Add search / filtering

Add a `SearchUsersDto` and wire it into `findAll`:

```ts
// dto/user.dto.ts
export class SearchUsersDto extends PaginationDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  role?: string;
}

// users.service.ts
async findAll(query: SearchUsersDto) {
  const { skip, take, orderBy } = this.parsePagination(query);

  const where: any = {};
  if (query.search) {
    where.OR = [
      { name: { contains: query.search, mode: 'insensitive' } },
      { email: { contains: query.search, mode: 'insensitive' } },
    ];
  }
  if (query.status) where.status = query.status;
  if (query.role) {
    where.roles = { some: { role: { code: query.role } } };
  }

  const [items, total] = await Promise.all([
    this.prisma.client.user.findMany({ where, skip, take, orderBy, select: { /* ... */ } }),
    this.prisma.client.user.count({ where }),
  ]);

  return { items, total, page: query.page ?? 1, limit: take, pages: Math.ceil(total / take) };
}
```

### Add validation rules

Use class-validator decorators in DTOs:

```ts
import { IsEmail, IsString, MinLength, MaxLength, Matches } from 'class-validator';

export class CreateUserDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @Matches(/(?=.*[A-Z])(?=.*[0-9])/, { message: 'Password must contain uppercase and number' })
  password: string;
}
```

## Service pattern comparison

| Pattern | Base class | ORM | Use when |
|---|---|---|---|
| **Plain service + PrismaService** | None | Prisma | Full control, complex queries with `include`/`select`, template default |
| **PrismaBaseRepository subclass** | `PrismaBaseRepository<T>` | Prisma | Standardized CRUD, ORM-agnostic interface, less boilerplate |
| **CrudService + BaseRepository** | `BaseRepository<T>` | Mongoose | MongoDB projects, reader/writer split, cache-aside |

The Backend Core template uses the plain service pattern because it needs Prisma's full `include` and `select` type safety for role/membership joins. For simpler entities without deep relations, `PrismaBaseRepository` reduces boilerplate.

## Missing features to add yourself

The template provides a solid foundation but intentionally excludes features that vary by application:

| Feature | What to build | Suggested approach |
|---|---|---|
| **Email verification** | Send verification email on create, verify endpoint with token | Add `emailVerified: Boolean` to User model. Use JWT with `resetSecret` for verification tokens. Add `POST /auth/verify-email` endpoint. |
| **OAuth / social login** | Google, GitHub, etc. | Use `SocialAuthModule` from nestjs-boot or Passport strategies. Link social accounts to User via a `SocialAccount` model. |
| **Two-factor auth (TOTP)** | Authenticator app support | Use `TotpModule` from nestjs-boot. Add `totpSecret` and `totpEnabled` to User model. |
| **Avatar upload** | Profile image | Use `FileStorageModule` from nestjs-boot. Store URL in `avatar` field. Validate file type and size. |
| **Password reset** | Forgot password flow | Generate reset token via `JwtService.sign()` with `resetSecret`. Send email with reset link. Add `POST /auth/forgot-password` and `POST /auth/reset-password` endpoints. |
| **Account deactivation / GDPR** | Self-service account deletion, data export | Add `DELETE /users/me` endpoint. Implement data anonymization (hash PII, keep audit records). |
| **Invitation system** | Invite users by email before they register | Add `Invitation` model with token, role, org. Send invite email. `POST /auth/accept-invite` creates user with pre-assigned role. |

## See also

- [Authentication](authentication.md) — JWT setup, login, refresh tokens
- [Authorization](authorization.md) — `@Roles`, `@Permissions`, RBAC configuration
- [Scope Authorization](scope-authorization.md) — `@RequireScope` for data-level access control
- [Prisma](prisma.md) — `PrismaBaseRepository` API and patterns
- [Testing Guide](testing-guide.md) — testing with mock PrismaService
