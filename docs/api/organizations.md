# Organizations API Reference

> Composable, store-agnostic organization/department/team hierarchy with membership management.

## Module Registration

```ts
OrganizationModule.register(options?: OrganizationModuleOptions): DynamicModule
```

`OrganizationModule` is `global: true`. Defaults to `MemoryOrganizationStore` when no store is provided (suitable for development and testing). For production, supply a custom `OrganizationStore` backed by your database.

```ts
import { OrganizationModule } from '@nestjs-boot/organizations';

// Development / testing — in-memory store
OrganizationModule.register()

// Production — custom Mongoose-backed store
OrganizationModule.register({
  store: new MongoOrganizationStore(models),
})
```

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `store` | `OrganizationStore` | `MemoryOrganizationStore` | Persistence backend for org/dept/team/membership data |

---

## Classes

### `OrganizationService`

> High-level service for managing organizations, departments, teams, and memberships. Includes data integrity checks (uniqueness, parent existence).

Injectable via class token. Exported from `OrganizationModule`.

#### Organization methods

##### `createOrganization(data: Partial<OrganizationEntity>): Promise<OrganizationEntity>`

Create a new organization. Throws `ConflictException` if `data.code` already exists.

##### `getOrganization(id: string): Promise<OrganizationEntity>`

Find an organization by ID. Throws `NotFoundException` if not found.

##### `listOrganizations(filter?: Record<string, any>): Promise<OrganizationEntity[]>`

Find all organizations matching the given field filter. Pass `undefined` to list all.

##### `updateOrganization(id: string, data: Partial<OrganizationEntity>): Promise<OrganizationEntity>`

Update an organization. Verifies it exists first (throws `NotFoundException`).

#### Department methods

##### `createDepartment(data: Partial<DepartmentEntity>): Promise<DepartmentEntity>`

Create a department. Validates that `data.organizationId` exists and, if `data.parentId` is set, that the parent department exists.

##### `getDepartment(id: string): Promise<DepartmentEntity>`

Find a department by ID. Throws `NotFoundException` if not found.

##### `listDepartments(filter?: Record<string, any>): Promise<DepartmentEntity[]>`

Find all departments matching the filter.

##### `updateDepartment(id: string, data: Partial<DepartmentEntity>): Promise<DepartmentEntity>`

Update a department. Verifies it exists first.

#### Team methods

##### `createTeam(data: Partial<TeamEntity>): Promise<TeamEntity>`

Create a team. Validates that `data.departmentId` exists.

##### `getTeam(id: string): Promise<TeamEntity>`

Find a team by ID. Throws `NotFoundException` if not found.

##### `listTeams(filter?: Record<string, any>): Promise<TeamEntity[]>`

Find all teams matching the filter.

##### `updateTeam(id: string, data: Partial<TeamEntity>): Promise<TeamEntity>`

Update a team. Verifies it exists first.

#### Membership methods

##### `addMember(membership: UserOrganizationMembership): Promise<void>`

Add a user to an organization (and optionally a department and team). Validates the organization exists. Replaces any existing membership for the same `userId + organizationId` pair.

##### `removeMember(userId: string, organizationId: string): Promise<void>`

Remove a user from an organization.

##### `getUserMemberships(userId: string): Promise<UserOrganizationMembership[]>`

Return all organization memberships for a user.

##### `getOrganizationMembers(organizationId: string): Promise<UserOrganizationMembership[]>`

Return all members of an organization.

##### `getDepartmentMembers(departmentId: string): Promise<UserOrganizationMembership[]>`

Return all members assigned to a department.

##### `getTeamMembers(teamId: string): Promise<UserOrganizationMembership[]>`

Return all members assigned to a team.

#### Convenience helpers

##### `isUserInOrganization(userId: string, organizationId: string): Promise<boolean>`

Check whether a user has any membership in the given organization.

##### `isUserInDepartment(userId: string, departmentId: string): Promise<boolean>`

Check whether a user is assigned to the given department.

##### `isUserInTeam(userId: string, teamId: string): Promise<boolean>`

Check whether a user is assigned to the given team.

---

### `MemoryOrganizationStore`

> In-memory `OrganizationStore` implementation. Thread-safe for a single process. Resets on restart — **not for production use**.

Instantiated automatically when no `store` is provided in `OrganizationModuleOptions`. IDs are auto-generated as `org_1`, `org_2`, etc.

Implements all `OrganizationStore` methods. `addMember` replaces existing membership for the same `userId + organizationId` pair before inserting.

---

## Interfaces

### `OrganizationEntity`

```ts
interface OrganizationEntity {
  id: string;
  name: string;
  code: string;          // Unique short code (e.g. 'ACME')
  description?: string;
  isActive: boolean;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}
```

### `DepartmentEntity`

```ts
interface DepartmentEntity {
  id: string;
  organizationId: string;
  name: string;
  code: string;
  description?: string;
  parentId?: string;     // Optional parent department for nested hierarchies
  isActive: boolean;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}
```

### `TeamEntity`

```ts
interface TeamEntity {
  id: string;
  departmentId: string;
  organizationId: string;
  name: string;
  code: string;
  description?: string;
  isActive: boolean;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}
```

### `UserOrganizationMembership`

```ts
interface UserOrganizationMembership {
  userId: string;
  organizationId: string;
  departmentId?: string;
  teamId?: string;
  role?: string;         // E.g. 'member', 'manager', 'owner'
  joinedAt: Date;
}
```

### `OrganizationStore`

Implement this interface to persist org data in your own database (Mongoose, Prisma, etc.).

```ts
interface OrganizationStore {
  // Organizations
  createOrganization(data: Partial<OrganizationEntity>): Promise<OrganizationEntity>;
  findOrganization(id: string): Promise<OrganizationEntity | null>;
  findOrganizations(filter?: Record<string, any>): Promise<OrganizationEntity[]>;
  updateOrganization(id: string, data: Partial<OrganizationEntity>): Promise<OrganizationEntity>;

  // Departments
  createDepartment(data: Partial<DepartmentEntity>): Promise<DepartmentEntity>;
  findDepartment(id: string): Promise<DepartmentEntity | null>;
  findDepartments(filter?: Record<string, any>): Promise<DepartmentEntity[]>;
  updateDepartment(id: string, data: Partial<DepartmentEntity>): Promise<DepartmentEntity>;

  // Teams
  createTeam(data: Partial<TeamEntity>): Promise<TeamEntity>;
  findTeam(id: string): Promise<TeamEntity | null>;
  findTeams(filter?: Record<string, any>): Promise<TeamEntity[]>;
  updateTeam(id: string, data: Partial<TeamEntity>): Promise<TeamEntity>;

  // Memberships
  addMember(membership: UserOrganizationMembership): Promise<void>;
  removeMember(userId: string, organizationId: string): Promise<void>;
  getUserMemberships(userId: string): Promise<UserOrganizationMembership[]>;
  getOrganizationMembers(organizationId: string): Promise<UserOrganizationMembership[]>;
  getDepartmentMembers(departmentId: string): Promise<UserOrganizationMembership[]>;
  getTeamMembers(teamId: string): Promise<UserOrganizationMembership[]>;
}
```

### `OrganizationModuleOptions`

```ts
interface OrganizationModuleOptions {
  store?: OrganizationStore;
}
```

---

## Constants / Tokens

| Token | Value | Description |
|-------|-------|-------------|
| `ORGANIZATION_STORE` | `'BOOT_ORGANIZATION_STORE'` | Injection token for the `OrganizationStore` instance |
| `ORGANIZATION_OPTIONS` | `'BOOT_ORGANIZATION_OPTIONS'` | Injection token for `OrganizationModuleOptions` |
