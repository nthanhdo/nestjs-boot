# Scope Authorization

> **TL;DR** — RBAC answers "WHO can do this?" Scope answers "HOW MUCH DATA can they see?" Five levels from OWN (most restrictive) to SYSTEM (unrestricted). Use `@RequireScope()` on routes and `buildScopeFilter()` in services.

## The difference between RBAC and Scope

| Dimension | RBAC | Scope |
|---|---|---|
| Question | "Can this user perform this action?" | "What subset of data can this user see?" |
| Mechanism | `@Roles()`, `@Permissions()` | `@RequireScope()`, `buildScopeFilter()` |
| Granularity | Action-level (read, write, delete) | Data-level (own, team, department, org, all) |
| Example | "Can a MANAGER export reports?" | "Which reports can they see? Only their department's." |

Both work together. A route might require `@Permissions('report:read')` (action gate) AND `@RequireScope(AccessScope.DEPARTMENT)` (data gate).

## The 5 scope levels

```
                    ┌─────────────────────────┐
                    │        SYSTEM            │  Level 50
                    │  ┌───────────────────┐   │
                    │  │   ORGANIZATION     │   │  Level 40
                    │  │  ┌─────────────┐   │   │
                    │  │  │  DEPARTMENT   │   │   │  Level 30
                    │  │  │  ┌───────┐   │   │   │
                    │  │  │  │  TEAM  │   │   │   │  Level 20
                    │  │  │  │ ┌───┐ │   │   │   │
                    │  │  │  │ │OWN│ │   │   │   │  Level 10
                    │  │  │  │ └───┘ │   │   │   │
                    │  │  │  └───────┘   │   │   │
                    │  │  └─────────────┘   │   │
                    │  └───────────────────┘   │
                    └─────────────────────────┘
```

| Scope | Level | Data visible | Typical role |
|---|---|---|---|
| `OWN` | 10 | Only records owned by the current user | Staff, User |
| `TEAM` | 20 | All records in the user's team | Team Leader |
| `DEPARTMENT` | 30 | All records in the user's department | Manager |
| `ORGANIZATION` | 40 | All records in the user's organization | Admin |
| `SYSTEM` | 50 | All records across all organizations | Super Admin |

Each level includes all data from lower levels. A user with DEPARTMENT scope can see their own records, their team's records, and their department's records.

## Setup

```ts
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
      extractContext: (req) => ({
        userId: req.user?.sub ?? req.user?.id,
        organizationId: req.user?.organizationId,
        departmentId: req.user?.departmentId,
        teamId: req.user?.teamId,
      }),
    }),
  ],
})
export class AppModule {}
```

`ScopeModule.register()` registers `ScopeGuard` as a global guard (via `APP_GUARD`) and exports `ScopeResolver`.

### ScopeModuleOptions

| Option | Type | Default | Description |
|---|---|---|---|
| `extractContext` | `(req) => ScopeContext` | Reads from `request.user` | How to extract userId, orgId, deptId, teamId |
| `resolveScope` | `(req) => AccessScope` | Reads `request.user.scope` | How to determine the user's maximum scope |
| `defaultScope` | `AccessScope` | `OWN` | Fallback when no scope can be resolved |

## @RequireScope decorator

Declare the minimum scope level required for a route:

```ts
import { RequireScope, AccessScope, Permissions } from 'nestjs-boot';

@Controller('tasks')
export class TasksController {
  @Get()
  @Permissions('task:read')
  @RequireScope(AccessScope.TEAM)
  findAll() {
    // User must have at least TEAM scope (level 20+)
    // STAFF with OWN scope → 403
    // LEADER with TEAM scope → allowed
    // MANAGER with DEPARTMENT scope → allowed
  }

  @Get(':id')
  @Permissions('task:read')
  // No @RequireScope → defaults to OWN (any authenticated user)
  findById(@Param('id') id: string) { ... }

  @Delete(':id')
  @Permissions('task:delete')
  @RequireScope(AccessScope.ORGANIZATION)
  delete(@Param('id') id: string) {
    // Only ADMIN (ORG scope) or SUPER_ADMIN (SYSTEM scope)
  }
}
```

The guard compares numeric levels: `userScope >= requiredScope`. If the user's resolved scope is lower, `403 Forbidden: "Insufficient scope: requires DEPARTMENT, user has OWN"`.

## buildScopeFilter — wiring into service queries

The guard controls route access. The filter controls data access. Both are needed:

```ts
import { Injectable } from '@nestjs/common';
import { ScopeResolver } from 'nestjs-boot';

@Injectable()
export class TaskService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scopeResolver: ScopeResolver,
  ) {}

  async findAll(request: any) {
    const context = await this.scopeResolver.extractContext(request);
    const scope = await this.scopeResolver.resolveScope(request);
    const filter = this.scopeResolver.buildScopeFilter(scope, context);

    return this.prisma.client.task.findMany({
      where: { ...filter, status: 'ACTIVE' },
    });
  }
}
```

### Filter output by scope

| User scope | Context | Filter produced |
|---|---|---|
| OWN | `{ userId: 'u1' }` | `{ ownerId: 'u1' }` |
| TEAM | `{ teamId: 't1' }` | `{ teamId: 't1' }` |
| TEAM | `{ teamId: undefined }` | `{ ownerId: 'u1' }` (fallback) |
| DEPARTMENT | `{ departmentId: 'd1' }` | `{ departmentId: 'd1' }` |
| ORGANIZATION | `{ organizationId: 'o1' }` | `{ organizationId: 'o1' }` |
| SYSTEM | any | `{}` (no filter) |

When the required context field is missing (e.g., user has TEAM scope but no `teamId` in their JWT), the filter falls back to `{ ownerId: userId }` for safety.

## Combining @Roles + @Permissions + @RequireScope

All three can be applied to the same route. Guards execute in this order:

1. **JwtAuthGuard** — authenticates the user (populates `request.user`)
2. **RolesGuard** — checks `@Roles()` (ANY match)
3. **PermissionsGuard** — checks `@Permissions()` (ALL match)
4. **ScopeGuard** — checks `@RequireScope()` (level comparison)

```ts
@Roles('MANAGER', 'ADMIN')              // Must be MANAGER or ADMIN
@Permissions('report:read', 'report:export')  // Must have both permissions
@RequireScope(AccessScope.DEPARTMENT)    // Must have at least DEPARTMENT scope
@Get('export')
exportReport() {
  // All three checks must pass:
  // 1. User has MANAGER or ADMIN role
  // 2. User has report:read AND report:export permissions
  // 3. User's scope is DEPARTMENT (30) or higher
}
```

Any single check failing results in `403 Forbidden`.

## ScopeContext

The context object extracted from the request:

```ts
interface ScopeContext {
  userId: string;          // always required
  organizationId?: string; // from JWT or DB lookup
  departmentId?: string;   // from JWT or DB lookup
  teamId?: string;         // from JWT or DB lookup
}
```

### Custom extractContext

Override extraction for non-standard JWT shapes:

```ts
ScopeModule.register({
  extractContext: async (req) => {
    const userId = req.user?.sub;
    // Look up memberships from DB if not in JWT
    const membership = await membershipService.getPrimary(userId);
    return {
      userId,
      organizationId: membership?.orgId,
      departmentId: membership?.deptId,
      teamId: membership?.teamId,
    };
  },
})
```

## Best practices

1. **Always pair `@RequireScope` with `buildScopeFilter`** — the guard prevents low-scope users from reaching the endpoint, but the filter ensures they only see appropriate data.
2. **Include org/dept/team IDs in JWT** — avoids a DB lookup per request. Trade-off: stale until token refresh.
3. **Default to `AccessScope.OWN`** — principle of least privilege. Users see only their own data unless explicitly scoped higher.
4. **Map roles to scopes in one place** — the `resolveScope` function is the single source of truth for which roles get which scope level.

## See also

- [Authorization](authorization.md) — RBAC guards, @Roles, @Permissions
- [Multi-Tenant Organizations](multi-tenant-organizations.md) — OrganizationModule + wiring
- [Authorization Decision Guide](authorization-decision-guide.md) — Roles vs Permissions vs Policy
