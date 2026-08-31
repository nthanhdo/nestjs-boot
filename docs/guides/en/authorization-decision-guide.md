# Authorization Decision Guide

> **TL;DR** — Use `@Roles()` for identity-based access ("only admins"). Use `@Permissions()` for action-level gates ("can export reports"). Use `@CheckPolicy()` for resource-instance checks ("is this their own report?"). Add `@RequireScope()` on top when data visibility matters.

## Decision tree

```
Is the check about WHO the user is (role/identity)?
  │
  ├── YES → @Roles('admin', 'manager')
  │         Guards: RolesGuard (ANY match)
  │
  └── NO
       │
       Is the check about WHAT the user can do (action)?
         │
         ├── YES → @Permissions('report:export')
         │         Guards: PermissionsGuard (ALL match)
         │
         └── NO
              │
              Is the check about a SPECIFIC resource instance?
                │
                ├── YES → @CheckPolicy('ownership')
                │         Guards: PolicyGuard (evaluate policy against resource)
                │
                └── Add @RequireScope() if data visibility is bounded
                          (OWN / TEAM / DEPT / ORG / SYSTEM)
```

## Comparison table

| Dimension | `@Roles()` | `@Permissions()` | `@CheckPolicy()` | `@RequireScope()` |
|---|---|---|---|---|
| **Question** | Is the user an admin? | Can they export? | Is this their report? | How much data can they see? |
| **Match logic** | ANY role matches | ALL permissions match | Policy returns `allowed: true` | User scope >= required scope |
| **Data source** | JWT `roles` array | JWT `permissions` or DB store | Policy evaluates request + resource | JWT org/dept/team context |
| **Guard** | `RolesGuard` | `PermissionsGuard` | `PolicyGuard` | `ScopeGuard` |
| **Sync/Async** | Sync | Sync (JWT) or Async (DB store) | Async | Async |
| **Granularity** | Coarse (role groups) | Medium (action-level) | Fine (resource-instance) | Data boundary |

## Examples

### Simple identity check — @Roles

"Only admins and managers can access the admin dashboard."

```ts
@Roles('ADMIN', 'MANAGER')
@Get('dashboard')
getDashboard() { ... }
```

### Action-level gate — @Permissions

"Anyone with `report:export` permission can export, regardless of role."

```ts
@Permissions('report:export')
@Get('reports/export')
exportReport() { ... }
```

### Resource-instance check — @CheckPolicy

"Users can only edit their own profile, unless they have `user:update` permission."

```ts
// policies/ownership.policy.ts
@Injectable()
export class OwnershipPolicy implements AuthorizationPolicy {
  readonly name = 'ownership';

  async evaluate(context: AuthorizationContext): Promise<AuthorizationResult> {
    if (context.user.id === context.resourceId) {
      return { allowed: true, reason: 'User owns this resource', policy: this.name };
    }
    // Fall through — policy engine checks other policies or denies
    return { allowed: false, reason: 'Not the resource owner', policy: this.name };
  }
}

// controller
@CheckPolicy('ownership')
@Patch('users/:id')
updateProfile(@Param('id') id: string, @Body() dto: UpdateProfileDto) { ... }
```

### Data visibility — @RequireScope

"Managers can see all reports in their department. Staff can only see their own."

```ts
@Permissions('report:read')
@RequireScope(AccessScope.OWN) // even staff can hit this endpoint
@Get('reports')
findAll(@Req() req) {
  // ScopeGuard passes — but the service uses buildScopeFilter
  // to limit data based on the user's actual scope level
  const filter = this.scopeResolver.buildScopeFilter(
    await this.scopeResolver.resolveScope(req),
    await this.scopeResolver.extractContext(req),
  );
  return this.reportService.findAll(filter);
}
```

## How all 3 compose together

Guards execute in registration order. With the standard setup:

```
Request
  → JwtAuthGuard       (authenticate, populate request.user)
  → RolesGuard         (check @Roles — ANY match)
  → PermissionsGuard   (check @Permissions — ALL match)
  → ScopeGuard         (check @RequireScope — level comparison)
  → PolicyGuard        (check @CheckPolicy — evaluate policy)
  → Controller method
```

Each guard independently decides to pass or throw `403`. If any guard throws, the request is rejected.

### Full composition example

```ts
@Roles('MANAGER', 'ADMIN')                    // 1. Must be MANAGER or ADMIN
@Permissions('report:read', 'report:detail')   // 2. Must have both permissions
@RequireScope(AccessScope.DEPARTMENT)           // 3. Must have DEPARTMENT+ scope
@CheckPolicy('orgBoundary')                     // 4. Must pass org boundary check
@Get('reports/:id/detail')
getReportDetail(@Param('id') id: string) {
  // All 4 checks must pass
}
```

## When to add Scope on top

Add `@RequireScope()` when:

- The endpoint returns a **list** of resources that should be filtered by organizational hierarchy
- Different roles should see **different amounts of data** through the same endpoint
- You need to enforce that a STAFF user cannot see their manager's reports, even if they have `report:read` permission

Skip `@RequireScope()` when:

- The endpoint operates on a **single resource** identified by ID (use `@CheckPolicy` for ownership instead)
- All authenticated users with the right permission should see the same data
- The resource is not organizational (e.g., system configuration, public catalogs)

## Quick reference

| Scenario | Decorator(s) |
|---|---|
| Admin-only page | `@Roles('ADMIN')` |
| Any user who can read products | `@Permissions('product:read')` |
| Edit own profile only | `@CheckPolicy('ownership')` |
| List orders in my department | `@Permissions('order:read')` + `@RequireScope(AccessScope.DEPARTMENT)` |
| Super-admin system reset | `@SuperAdminOnly()` |
| Public health check | `@Public()` |
| Manager can export, needs both read and export perms | `@Roles('MANAGER', 'ADMIN')` + `@Permissions('report:read', 'report:export')` |
| Cross-org admin action with policy | `@Roles('ADMIN')` + `@CheckPolicy('orgBoundary')` + `@RequireScope(AccessScope.ORGANIZATION)` |

## See also

- [Authorization](authorization.md) — full RBAC guide with all 7 config options
- [Scope Authorization](scope-authorization.md) — scope levels and buildScopeFilter
- [Multi-Tenant Organizations](multi-tenant-organizations.md) — org hierarchy + scope wiring
