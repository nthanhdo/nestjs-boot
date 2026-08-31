import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ── Role definitions ────────────────────────────────────────────────────────

const ROLES = [
  { code: 'SUPER_ADMIN', name: 'Super Administrator', level: 100, isSystem: true, description: 'Full system access. Cannot be modified.' },
  { code: 'ADMIN',       name: 'Administrator',       level: 90,  isSystem: true, description: 'Organization-wide administration.' },
  { code: 'MANAGER',     name: 'Manager',             level: 70,  isSystem: true, description: 'Department-level management.' },
  { code: 'MODERATOR',   name: 'Moderator',           level: 50,  isSystem: true, description: 'Content and user moderation.' },
  { code: 'LEADER',      name: 'Team Leader',         level: 40,  isSystem: true, description: 'Team-level coordination.' },
  { code: 'STAFF',       name: 'Staff',               level: 20,  isSystem: true, description: 'Standard staff member.' },
  { code: 'USER',        name: 'User',                level: 10,  isSystem: true, description: 'Base authenticated user.' },
] as const;

// ── Permission definitions ──────────────────────────────────────────────────

const PERMISSIONS = [
  // User management
  { code: 'user.read',   name: 'Read Users',   resource: 'user', action: 'read',   description: 'View user profiles and lists.' },
  { code: 'user.create', name: 'Create Users', resource: 'user', action: 'create', description: 'Create new user accounts.' },
  { code: 'user.update', name: 'Update Users', resource: 'user', action: 'update', description: 'Modify existing user accounts.' },
  { code: 'user.delete', name: 'Delete Users', resource: 'user', action: 'delete', description: 'Remove user accounts.' },
  // Role management
  { code: 'role.read',   name: 'Read Roles',   resource: 'role', action: 'read',   description: 'View roles and assignments.' },
  { code: 'role.manage', name: 'Manage Roles', resource: 'role', action: 'manage', description: 'Assign and revoke roles.' },
  // Task management
  { code: 'task.read',     name: 'Read Tasks',     resource: 'task', action: 'read',     description: 'View tasks.' },
  { code: 'task.create',   name: 'Create Tasks',   resource: 'task', action: 'create',   description: 'Create new tasks.' },
  { code: 'task.assign',   name: 'Assign Tasks',   resource: 'task', action: 'assign',   description: 'Assign tasks to users.' },
  { code: 'task.complete', name: 'Complete Tasks', resource: 'task', action: 'complete', description: 'Mark tasks as complete.' },
  // Reporting
  { code: 'report.read',        name: 'Read Reports',        resource: 'report', action: 'read',        description: 'View summary reports.' },
  { code: 'report.detail.read', name: 'Read Report Details', resource: 'report', action: 'detail.read', description: 'View detailed report data.' },
  { code: 'report.export',      name: 'Export Reports',      resource: 'report', action: 'export',      description: 'Export reports to file.' },
  // Audit log
  { code: 'audit_log.read', name: 'Read Audit Log', resource: 'audit_log', action: 'read', description: 'View audit trail entries.' },
] as const;

// ── Role-permission matrix ──────────────────────────────────────────────────
// Based on the Healthcare Auth spec: higher roles inherit downward.

const ROLE_PERMISSIONS: Record<string, string[]> = {
  SUPER_ADMIN: [
    'user.read', 'user.create', 'user.update', 'user.delete',
    'role.read', 'role.manage',
    'task.read', 'task.create', 'task.assign', 'task.complete',
    'report.read', 'report.detail.read', 'report.export',
    'audit_log.read',
  ],
  ADMIN: [
    'user.read', 'user.create', 'user.update', 'user.delete',
    'role.read', 'role.manage',
    'task.read', 'task.create', 'task.assign', 'task.complete',
    'report.read', 'report.detail.read', 'report.export',
    'audit_log.read',
  ],
  MANAGER: [
    'user.read', 'user.create', 'user.update',
    'role.read',
    'task.read', 'task.create', 'task.assign', 'task.complete',
    'report.read', 'report.detail.read', 'report.export',
  ],
  MODERATOR: [
    'user.read', 'user.update',
    'role.read',
    'task.read', 'task.create', 'task.assign', 'task.complete',
    'report.read', 'report.detail.read',
  ],
  LEADER: [
    'user.read',
    'task.read', 'task.create', 'task.assign', 'task.complete',
    'report.read',
  ],
  STAFF: [
    'user.read',
    'task.read', 'task.create', 'task.complete',
    'report.read',
  ],
  USER: [
    'user.read',
    'task.read', 'task.complete',
  ],
};

// ── Role hierarchy ──────────────────────────────────────────────────────────
// (child, parent) — child inherits all permissions from parent.

const ROLE_HIERARCHY: Array<{ roleCode: string; parentRoleCode: string }> = [
  { roleCode: 'ADMIN',     parentRoleCode: 'SUPER_ADMIN' },
  { roleCode: 'MANAGER',   parentRoleCode: 'ADMIN' },
  { roleCode: 'MODERATOR', parentRoleCode: 'MANAGER' },
  { roleCode: 'LEADER',    parentRoleCode: 'MODERATOR' },
  { roleCode: 'STAFF',     parentRoleCode: 'LEADER' },
  { roleCode: 'USER',      parentRoleCode: 'STAFF' },
];

// ── Scope definitions ───────────────────────────────────────────────────────

const SCOPES = [
  {
    name: 'OWN',
    level: 10,
    description: 'Access restricted to the actor\'s own resources.',
    filterTemplate: { field: 'userId', operator: 'eq', value: '{{actor.id}}' },
  },
  {
    name: 'TEAM',
    level: 20,
    description: 'Access extended to resources within the actor\'s team.',
    filterTemplate: { field: 'teamId', operator: 'eq', value: '{{actor.teamId}}' },
  },
  {
    name: 'DEPARTMENT',
    level: 30,
    description: 'Access extended to resources within the actor\'s department.',
    filterTemplate: { field: 'departmentId', operator: 'eq', value: '{{actor.departmentId}}' },
  },
  {
    name: 'ORGANIZATION',
    level: 40,
    description: 'Access extended to all resources in the actor\'s organization.',
    filterTemplate: { field: 'organizationId', operator: 'eq', value: '{{actor.organizationId}}' },
  },
  {
    name: 'SYSTEM',
    level: 50,
    description: 'Unrestricted access across all organizations.',
    filterTemplate: null,
  },
] as const;

// ── Seed function ───────────────────────────────────────────────────────────

export async function seed(client: PrismaClient) {
  console.log('🌱 Seeding database…');

  // Ensure schemas exist
  for (const schema of ['masterdata', 'metadata', 'userdata', 'analytics', 'statistics']) {
    await client.$executeRawUnsafe(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
  }

  // 1. Roles
  console.log('  → Roles');
  for (const role of ROLES) {
    await client.role.upsert({
      where:  { code: role.code },
      update: { name: role.name, level: role.level, isSystem: role.isSystem, description: role.description },
      create: role,
    });
  }

  // 2. Permissions
  console.log('  → Permissions');
  for (const perm of PERMISSIONS) {
    await client.permission.upsert({
      where:  { code: perm.code },
      update: { name: perm.name, resource: perm.resource, action: perm.action, description: perm.description },
      create: perm,
    });
  }

  // 3. Role-permission assignments
  console.log('  → Role-permission matrix');
  for (const [roleCode, permCodes] of Object.entries(ROLE_PERMISSIONS)) {
    for (const permissionCode of permCodes) {
      await client.rolePermission.upsert({
        where:  { roleCode_permissionCode: { roleCode, permissionCode } },
        update: {},
        create: { roleCode, permissionCode },
      });
    }
  }

  // 4. Role hierarchy
  console.log('  → Role hierarchy');
  for (const { roleCode, parentRoleCode } of ROLE_HIERARCHY) {
    await client.roleHierarchy.upsert({
      where:  { roleCode_parentRoleCode: { roleCode, parentRoleCode } },
      update: {},
      create: { roleCode, parentRoleCode },
    });
  }

  // 5. Scope definitions
  console.log('  → Scope definitions');
  for (const scope of SCOPES) {
    await client.scopeDefinition.upsert({
      where:  { name: scope.name },
      update: { level: scope.level, description: scope.description, filterTemplate: scope.filterTemplate ?? undefined },
      create: {
        name:           scope.name,
        level:          scope.level,
        description:    scope.description,
        filterTemplate: scope.filterTemplate ?? undefined,
      },
    });
  }

  // 6. Default organization
  console.log('  → Default organization');
  await client.organization.upsert({
    where:  { code: 'SYSTEM' },
    update: { name: 'System', isActive: true },
    create: {
      name:        'System',
      code:        'SYSTEM',
      description: 'Default system organization. Do not delete.',
      isActive:    true,
    },
  });

  console.log('✅ Seed complete.');
}

// ── Entrypoint ──────────────────────────────────────────────────────────────

async function main() {
  await seed(prisma);
}

main()
  .catch((err) => {
    console.error('❌ Seed failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
