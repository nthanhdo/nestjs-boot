# Multi-Tenant Organizations

> **TL;DR** — Wire `OrganizationModule` + `ScopeModule` + `AuthModule` together to get org-scoped data isolation. JWT carries `organizationId` / `departmentId` / `teamId` → `ScopeResolver` extracts context → `buildScopeFilter()` produces a query filter → your service applies it.

This guide covers the organizational hierarchy module and how it integrates with scope-based authorization to isolate data per org/department/team.

## Architecture overview

```
JWT payload
  ├── roles: ['MANAGER']
  ├── organizationId: 'org-1'
  ├── departmentId: 'dept-1'
  └── teamId: 'team-1'
        │
        ▼
  ScopeResolver.extractContext(request)
        │
        ▼
  ScopeContext { userId, organizationId, departmentId, teamId }
        │
        ▼
  ScopeResolver.buildScopeFilter(scope, context)
        │
        ▼
  { organizationId: 'org-1' }  ← applied to Prisma/Mongoose query
```

## Wiring the modules

### 1. AuthModule — JWT with org claims

```ts
// main.ts
const app = await createApp(AppModule, {
  auth: {
    jwt: {
      secret: process.env.JWT_SECRET,
      signOptions: { expiresIn: '1h' },
    },
    rbac: {
      enabled: true,
      denyByDefault: true,
      superAdmin: 'SUPER_ADMIN',
      hierarchy: [
        { name: 'SUPER_ADMIN', inherits: ['ADMIN'] },
        { name: 'ADMIN', inherits: ['MANAGER'] },
        { name: 'MANAGER', inherits: ['STAFF'] },
        { name: 'STAFF' },
      ],
    },
  },
});
```

When signing JWTs, include organization context:

```ts
// auth.service.ts
async login(user: User) {
  const membership = await this.orgService.getUserMemberships(user.id);
  const primary = membership[0]; // or user-selected org

  const payload = {
    sub: user.id,
    roles: user.roles.map(r => r.code),
    permissions: user.permissions,
    organizationId: primary?.organizationId,
    departmentId: primary?.departmentId,
    teamId: primary?.teamId,
  };

  return { access_token: this.jwtService.sign(payload) };
}
```

### 2. ScopeModule — resolve scope from roles

```ts
// app.module.ts
import { ScopeModule, AccessScope } from 'nestjs-boot';

@Module({
  imports: [
    ScopeModule.register({
      defaultScope: AccessScope.OWN,
      resolveScope: (req) => {
        const roles: string[] = req.user?.roles ?? [];
        if (roles.includes('SUPER_ADMIN')) return AccessScope.SYSTEM;
        if (roles.includes('ADMIN')) return AccessScope.ORGANIZATION;
        if (roles.includes('MANAGER')) return AccessScope.DEPARTMENT;
        if (roles.includes('LEADER')) return AccessScope.TEAM;
        return AccessScope.OWN;
      },
    }),
  ],
})
export class AppModule {}
```

`ScopeModule.register()` registers `ScopeGuard` as a global guard and exports `ScopeResolver`.

### 3. OrganizationModule — org hierarchy management

```ts
// app.module.ts
import { OrganizationModule } from 'nestjs-boot';

@Module({
  imports: [
    OrganizationModule.register(),
    // or with a custom store:
    // OrganizationModule.register({ store: new MongoOrganizationStore(models) }),
  ],
})
export class AppModule {}
```

## Framework OrganizationModule vs template OrganizationsService

nestjs-boot provides two separate things:

| | Framework `OrganizationModule` | Template `OrganizationsService` |
|---|---|---|
| **Location** | `nestjs-boot` package (`src/organizations/`) | `templates/backend-core/src/organizations/` |
| **Purpose** | Store-agnostic org/dept/team hierarchy abstraction | REST API controller + service using Prisma |
| **Persistence** | Via `OrganizationStore` interface (pluggable) | Direct `PrismaService` calls |
| **Use when** | You want a framework-level abstraction that works with any ORM | You want a ready-to-use REST API for org management |

**Recommendation:** Start with the template service (it uses Prisma directly and gives you REST endpoints). Use the framework module when you need org hierarchy in framework-level code (e.g., custom guards, middleware).

## Using OrganizationService

```ts
import { OrganizationService } from 'nestjs-boot';

@Injectable()
export class MyService {
  constructor(private readonly orgService: OrganizationService) {}

  async setupOrg() {
    // Create organization
    const org = await this.orgService.createOrganization({
      name: 'Acme Corp',
      code: 'ACME',
    });

    // Create department
    const dept = await this.orgService.createDepartment({
      organizationId: org.id,
      name: 'Engineering',
      code: 'ENG',
    });

    // Create team
    const team = await this.orgService.createTeam({
      departmentId: dept.id,
      organizationId: org.id,
      name: 'Backend',
      code: 'BE',
    });

    // Add member
    await this.orgService.addMember({
      userId: 'user-123',
      organizationId: org.id,
      departmentId: dept.id,
      teamId: team.id,
      role: 'STAFF',
      joinedAt: new Date(),
    });

    // Query membership
    const isMember = await this.orgService.isUserInOrganization('user-123', org.id);
    const members = await this.orgService.getTeamMembers(team.id);
  }
}
```

## Membership model

```ts
interface UserOrganizationMembership {
  userId: string;
  organizationId: string;
  departmentId?: string;   // optional — user may belong to org without dept
  teamId?: string;          // optional — user may belong to dept without team
  role?: string;            // org-specific role (separate from system roles)
  joinedAt: Date;
}
```

A user can have memberships in multiple organizations. Each membership carries optional department, team, and org-specific role.

## Org-scoped data isolation

### Step 1: Add @RequireScope to routes

```ts
import { RequireScope, AccessScope, Permissions } from 'nestjs-boot';

@Controller('reports')
export class ReportsController {
  @Get()
  @Permissions('report:read')
  @RequireScope(AccessScope.DEPARTMENT)
  findAll() {
    // User must have at least DEPARTMENT-level scope
    return this.reportService.findAll();
  }
}
```

### Step 2: Build scope filter in service

```ts
import { Injectable } from '@nestjs/common';
import { ScopeResolver, AccessScope } from 'nestjs-boot';

@Injectable()
export class ReportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scopeResolver: ScopeResolver,
  ) {}

  async findAll(request: any) {
    // Extract scope context from JWT
    const context = await this.scopeResolver.extractContext(request);
    const scope = await this.scopeResolver.resolveScope(request);

    // Build filter based on scope level
    const scopeFilter = this.scopeResolver.buildScopeFilter(scope, context);
    // scope = DEPARTMENT → { departmentId: 'dept-1' }
    // scope = ORGANIZATION → { organizationId: 'org-1' }
    // scope = SYSTEM → {} (no filter)

    // Apply to query
    return this.prisma.client.report.findMany({
      where: {
        ...scopeFilter,
        // additional filters...
      },
    });
  }
}
```

### buildScopeFilter output by scope level

| Scope | Filter produced | Data visible |
|---|---|---|
| `OWN` | `{ ownerId: userId }` | Only user's own records |
| `TEAM` | `{ teamId: teamId }` | All records in user's team |
| `DEPARTMENT` | `{ departmentId: departmentId }` | All records in user's department |
| `ORGANIZATION` | `{ organizationId: organizationId }` | All records in user's org |
| `SYSTEM` | `{}` | All records (no filter) |

If the context field is missing (e.g., user has no `teamId`), the filter falls back to `{ ownerId: userId }`.

## Custom OrganizationStore

Implement `OrganizationStore` for your ORM:

```ts
import { OrganizationStore, OrganizationEntity } from 'nestjs-boot';

export class PrismaOrganizationStore implements OrganizationStore {
  constructor(private readonly prisma: PrismaService) {}

  async createOrganization(data: Partial<OrganizationEntity>) {
    return this.prisma.client.organization.create({ data: data as any });
  }

  async findOrganization(id: string) {
    return this.prisma.client.organization.findUnique({ where: { id } });
  }

  // ... implement all interface methods
}

// Wire it
OrganizationModule.register({
  store: new PrismaOrganizationStore(prismaService),
})
```

## Best practices

1. **Include org context in JWT** — avoids a DB lookup per request to determine org membership.
2. **Map roles to scopes in `resolveScope`** — keeps scope resolution centralized and consistent.
3. **Always apply `buildScopeFilter`** in services that return org-scoped data. Do not rely on the guard alone — the guard checks access level, but the filter enforces data boundaries.
4. **Use `@RequireScope` on routes** — documents the minimum access level and prevents low-scope users from reaching the endpoint.
5. **Test cross-org isolation** — create data for org A, authenticate as org B user, assert zero results.

## See also

- [Authorization](authorization.md) — RBAC guards, roles, permissions
- [Scope Authorization](scope-authorization.md) — conceptual guide for scope levels
- [Multi-Tenancy](multi-tenancy.md) — `TenancyModule` for tenant-level isolation (different from org-level)
- [User Management](user-management.md) — template CRUD with org membership
