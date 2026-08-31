# Multi-Membership per Organization — Migration Guide

## Current Limitation

The `UserOrganizationMembership` interface and its store implementations assume **one membership per user per organization**. The `OrganizationStore.removeMember(userId, organizationId)` signature removes by this pair, and `getUserMemberships()` returns a flat array with no support for multiple roles within the same org.

This means a user cannot simultaneously be:
- A "developer" in Engineering and a "reviewer" in QA (same org)
- A member of multiple departments with different roles

## Schema Changes for Matrix Organizations

### 1. Update `UserOrganizationMembership`

Add a unique `id` field and make the membership a first-class entity:

```typescript
export interface UserOrganizationMembership {
  id: string;                    // NEW — unique membership ID
  userId: string;
  organizationId: string;
  departmentId?: string;
  teamId?: string;
  role?: string;
  isPrimary?: boolean;           // NEW — designate one as primary
  permissions?: string[];        // NEW — per-membership permission overrides
  joinedAt: Date;
  expiresAt?: Date;              // NEW — time-bound memberships
}
```

### 2. Update `OrganizationStore` methods

```typescript
// Before (removes ALL memberships for user+org pair):
removeMember(userId: string, organizationId: string): Promise<void>;

// After (removes a specific membership by ID):
removeMembership(membershipId: string): Promise<void>;

// Add:
findMembership(membershipId: string): Promise<UserOrganizationMembership | null>;
getUserMembershipsForOrg(userId: string, organizationId: string): Promise<UserOrganizationMembership[]>;
```

### 3. Update `MemoryOrganizationStore`

The in-memory store uses array filtering by `userId + organizationId`. Change `removeMember` to filter by `id` instead. Update `getUserMemberships` to support returning multiple entries per org.

## Impact on ScopeResolver

`ScopeResolver.extractContext()` reads `request.user.organizationId` / `departmentId` / `teamId` — a single set of values. With multi-membership:

1. **Add membership selection**: The request must indicate which membership context is active (e.g., via `X-Membership-Id` header or query param).

2. **Update `extractContext`**:
   ```typescript
   async extractContext(request: any): Promise<ScopeContext> {
     const membershipId = request.headers['x-membership-id'] ?? request.user?.activeMembershipId;
     if (membershipId) {
       const membership = await this.orgStore.findMembership(membershipId);
       return {
         userId: request.user.id,
         organizationId: membership.organizationId,
         departmentId: membership.departmentId,
         teamId: membership.teamId,
       };
     }
     // fallback to primary membership
   }
   ```

3. **Update `buildScopeFilter`**: No changes needed — it already works with whatever `ScopeContext` is provided.

## Impact on Policies

- **RBAC guards**: If roles are per-membership (not global), `RolesGuard` must resolve roles from the active membership, not from a flat `user.roles` array.
- **Tenant isolation**: `TenantGuard` may need to verify the user has an active membership in the requested tenant/org.
- **Audit logging**: `AuditInterceptor` should log which membership context was active.

## Migration Steps

1. Add `id` and `isPrimary` fields to membership records
2. Backfill existing memberships with generated IDs and `isPrimary: true`
3. Update store implementations (Memory, Mongo, Prisma)
4. Add `X-Membership-Id` header support to `ScopeResolver`
5. Update tests — especially scope resolution with multiple memberships
6. Deploy with backward compatibility (missing `X-Membership-Id` → use primary)
