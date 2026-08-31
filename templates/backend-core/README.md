# {{name}}

> Backend service built with [nestjs-boot](https://github.com/nthanhdo/nestjs-boot).

## Quick Start

### Prerequisites
- Node.js 20+
- Docker & Docker Compose

### Setup

```bash
# Start infrastructure
docker-compose up -d postgres redis

# Install dependencies
npm install

# Generate Prisma client
npx prisma generate

# Run migrations
npx prisma migrate dev

# Seed database (roles, permissions, default org)
npm run db:seed

# Start development server
npm run start:dev
```

### Test it

```bash
# Health check
curl http://localhost:3000/api/v1/health

# Register
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@example.com", "password": "password123", "name": "Admin"}'

# Login
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@example.com", "password": "password123"}'

# Access protected endpoint (use token from login response)
curl http://localhost:3000/api/v1/auth/me \
  -H "Authorization: Bearer <token>"
```

### Swagger
Open http://localhost:3000/api/docs in your browser.

## Architecture

### Database Schemas
| Schema | Tables | Purpose |
|--------|--------|---------|
| masterdata | roles, permissions, organizations, departments, teams | Canonical definitions, cacheable |
| metadata | permission_definitions, scope_definitions, policy_definitions | Policy engine config |
| userdata | users, user_roles, user_permissions, memberships, tokens, sessions | User-owned state |
| analytics | audit_entries, security_events, login_attempts | Append-only audit trail |
| statistics | access_stats, permission_usage, scope_hits, policy_evaluations | Aggregated metrics |

### Auth Flow
1. Register → User created with role USER
2. Login → JWT access token (1h) + refresh token (7d)
3. Protected routes → JWT + RBAC + Scope + Policy guards
4. Refresh → Token rotation with reuse detection
5. All actions → Audit logged

### Role Hierarchy
```
SUPER_ADMIN (100) → system-wide access
  └── ADMIN (90) → organization-wide
       └── MANAGER (70) → department-wide
            └── MODERATOR (50) → team-wide
                 └── LEADER (40) → team-wide
                      └── STAFF (20) → own resources
                           └── USER (10) → own resources
```

## API Endpoints

### Auth
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | /auth/register | Public | Register new user |
| POST | /auth/login | Public | Login, get tokens |
| POST | /auth/refresh | Public | Refresh access token |
| POST | /auth/logout | JWT | Logout, revoke tokens |
| GET | /auth/me | JWT | Get current user profile |
| POST | /auth/forgot-password | Public | Request password reset |
| POST | /auth/reset-password | Public | Reset with token |
| POST | /auth/change-password | JWT | Change password |

### Users
| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| GET | /users | user.read | List users (paginated) |
| GET | /users/:id | user.read | Get user by ID |
| POST | /users | user.create | Create user |
| PATCH | /users/:id | user.update | Update user |
| DELETE | /users/:id | user.delete | Deactivate user |
| POST | /users/:id/roles | role.manage | Assign role |
| DELETE | /users/:id/roles/:code | role.manage | Remove role |

### Roles & Permissions
| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| GET | /roles | role.read | List all roles |
| GET | /roles/:code | role.read | Get role details |
| POST | /roles | role.manage | Create role |
| PATCH | /roles/:code | role.manage | Update role |
| DELETE | /roles/:code | role.manage | Delete role |
| GET | /roles/permissions/all | role.read | List all permissions |

### Organizations
| Method | Path | Permission | Scope |
|--------|------|------------|-------|
| GET | /organizations | organization.read | — |
| POST | /organizations | organization.create | SYSTEM |
| GET | /organizations/:id | organization.read | — |
| PATCH | /organizations/:id | organization.update | — |
| POST | /organizations/:orgId/departments | department.create | ORGANIZATION |
| POST | /organizations/departments/:deptId/teams | team.create | DEPARTMENT |
| POST | /organizations/:orgId/members | organization.manage | — |
| DELETE | /organizations/:orgId/members/:userId | organization.manage | — |

### Audit
| Method | Path | Permission | Scope |
|--------|------|------------|-------|
| GET | /audit-logs | audit_log.read | ORGANIZATION |
| GET | /security-events | audit_log.read | SYSTEM |

## Adding Your Domain

1. Create a new module: `mkdir -p src/your-domain`
2. Add Prisma models to `prisma/schema.prisma`
3. Run `npx prisma migrate dev --name add-your-domain`
4. Create service, controller, DTOs
5. Import module in `app.module.ts`
6. Use decorators: `@Permissions('your-domain.read')`, `@RequireScope(AccessScope.DEPARTMENT)`, `@CheckPolicy('ownership')`

## Docker

```bash
# Full stack
docker-compose up --build

# Production
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

## License

[MIT](LICENSE)
