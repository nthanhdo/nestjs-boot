import { describe, it, expect, beforeEach } from 'vitest';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { MemoryOrganizationStore } from '../../src/organizations/memory-organization.store';
import { OrganizationService } from '../../src/organizations/organization.service';
import { ORGANIZATION_STORE } from '../../src/organizations/constants';

// ─── helpers ────────────────────────────────────────────────────────────────

function makeService(store?: MemoryOrganizationStore): OrganizationService {
  const s = store ?? new MemoryOrganizationStore();
  // Manually inject — no NestJS DI needed for unit tests
  return new (OrganizationService as any)(s);
}

// ─── MemoryOrganizationStore ─────────────────────────────────────────────────

describe('MemoryOrganizationStore', () => {
  let store: MemoryOrganizationStore;

  beforeEach(() => {
    store = new MemoryOrganizationStore();
  });

  // Organizations

  it('createOrganization: persists and returns entity with generated id', async () => {
    const org = await store.createOrganization({ name: 'Acme', code: 'ACME' });
    expect(org.id).toBeDefined();
    expect(org.name).toBe('Acme');
    expect(org.code).toBe('ACME');
    expect(org.isActive).toBe(true);
    expect(org.createdAt).toBeInstanceOf(Date);
  });

  it('findOrganization: returns null for unknown id', async () => {
    expect(await store.findOrganization('missing')).toBeNull();
  });

  it('findOrganization: returns entity after create', async () => {
    const org = await store.createOrganization({ name: 'Acme', code: 'ACME' });
    const found = await store.findOrganization(org.id);
    expect(found).toEqual(org);
  });

  it('findOrganizations: filter by field', async () => {
    await store.createOrganization({ name: 'Alpha', code: 'ALPHA', isActive: true });
    await store.createOrganization({ name: 'Beta', code: 'BETA', isActive: false });
    const active = await store.findOrganizations({ isActive: true });
    expect(active).toHaveLength(1);
    expect(active[0].code).toBe('ALPHA');
  });

  it('updateOrganization: merges fields and bumps updatedAt', async () => {
    const org = await store.createOrganization({ name: 'Acme', code: 'ACME' });
    const before = org.updatedAt;
    const updated = await store.updateOrganization(org.id, { name: 'Acme Corp' });
    expect(updated.name).toBe('Acme Corp');
    expect(updated.code).toBe('ACME');
    expect(updated.updatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
  });

  it('updateOrganization: throws on unknown id', async () => {
    await expect(store.updateOrganization('ghost', { name: 'X' })).rejects.toThrow();
  });

  // Departments

  it('createDepartment: persists with parentId', async () => {
    const org = await store.createOrganization({ name: 'Acme', code: 'ACME' });
    const parent = await store.createDepartment({ organizationId: org.id, name: 'Engineering', code: 'ENG' });
    const child = await store.createDepartment({
      organizationId: org.id,
      name: 'Frontend',
      code: 'FE',
      parentId: parent.id,
    });
    expect(child.parentId).toBe(parent.id);
  });

  it('findDepartments: filter by organizationId', async () => {
    const org1 = await store.createOrganization({ name: 'A', code: 'A' });
    const org2 = await store.createOrganization({ name: 'B', code: 'B' });
    await store.createDepartment({ organizationId: org1.id, name: 'D1', code: 'D1' });
    await store.createDepartment({ organizationId: org2.id, name: 'D2', code: 'D2' });
    const depts = await store.findDepartments({ organizationId: org1.id });
    expect(depts).toHaveLength(1);
    expect(depts[0].code).toBe('D1');
  });

  // Teams

  it('createTeam: persists and links to dept + org', async () => {
    const org = await store.createOrganization({ name: 'Acme', code: 'ACME' });
    const dept = await store.createDepartment({ organizationId: org.id, name: 'Eng', code: 'ENG' });
    const team = await store.createTeam({ departmentId: dept.id, organizationId: org.id, name: 'Alpha', code: 'ALPHA' });
    expect(team.departmentId).toBe(dept.id);
    expect(team.organizationId).toBe(org.id);
  });

  // Memberships

  it('addMember + getUserMemberships: round-trip', async () => {
    const org = await store.createOrganization({ name: 'Acme', code: 'ACME' });
    await store.addMember({ userId: 'u1', organizationId: org.id, joinedAt: new Date() });
    const memberships = await store.getUserMemberships('u1');
    expect(memberships).toHaveLength(1);
    expect(memberships[0].organizationId).toBe(org.id);
  });

  it('addMember: upserts — re-adding same user+org replaces membership', async () => {
    const org = await store.createOrganization({ name: 'Acme', code: 'ACME' });
    await store.addMember({ userId: 'u1', organizationId: org.id, role: 'member', joinedAt: new Date() });
    await store.addMember({ userId: 'u1', organizationId: org.id, role: 'admin', joinedAt: new Date() });
    const memberships = await store.getUserMemberships('u1');
    expect(memberships).toHaveLength(1);
    expect(memberships[0].role).toBe('admin');
  });

  it('removeMember: removes only the matching user+org pair', async () => {
    const org = await store.createOrganization({ name: 'Acme', code: 'ACME' });
    const org2 = await store.createOrganization({ name: 'Beta', code: 'BETA' });
    await store.addMember({ userId: 'u1', organizationId: org.id, joinedAt: new Date() });
    await store.addMember({ userId: 'u1', organizationId: org2.id, joinedAt: new Date() });
    await store.removeMember('u1', org.id);
    const memberships = await store.getUserMemberships('u1');
    expect(memberships).toHaveLength(1);
    expect(memberships[0].organizationId).toBe(org2.id);
  });

  it('getOrganizationMembers: returns members scoped to org', async () => {
    const org = await store.createOrganization({ name: 'Acme', code: 'ACME' });
    const org2 = await store.createOrganization({ name: 'Beta', code: 'BETA' });
    await store.addMember({ userId: 'u1', organizationId: org.id, joinedAt: new Date() });
    await store.addMember({ userId: 'u2', organizationId: org2.id, joinedAt: new Date() });
    const members = await store.getOrganizationMembers(org.id);
    expect(members).toHaveLength(1);
    expect(members[0].userId).toBe('u1');
  });

  it('getDepartmentMembers: filters by departmentId', async () => {
    const org = await store.createOrganization({ name: 'Acme', code: 'ACME' });
    const dept = await store.createDepartment({ organizationId: org.id, name: 'Eng', code: 'ENG' });
    await store.addMember({ userId: 'u1', organizationId: org.id, departmentId: dept.id, joinedAt: new Date() });
    await store.addMember({ userId: 'u2', organizationId: org.id, joinedAt: new Date() });
    const members = await store.getDepartmentMembers(dept.id);
    expect(members).toHaveLength(1);
    expect(members[0].userId).toBe('u1');
  });

  it('getTeamMembers: filters by teamId', async () => {
    const org = await store.createOrganization({ name: 'Acme', code: 'ACME' });
    const dept = await store.createDepartment({ organizationId: org.id, name: 'Eng', code: 'ENG' });
    const team = await store.createTeam({ departmentId: dept.id, organizationId: org.id, name: 'Alpha', code: 'ALPHA' });
    await store.addMember({ userId: 'u1', organizationId: org.id, teamId: team.id, joinedAt: new Date() });
    await store.addMember({ userId: 'u2', organizationId: org.id, joinedAt: new Date() });
    const members = await store.getTeamMembers(team.id);
    expect(members).toHaveLength(1);
    expect(members[0].userId).toBe('u1');
  });
});

// ─── OrganizationService ─────────────────────────────────────────────────────

describe('OrganizationService', () => {
  let store: MemoryOrganizationStore;
  let service: OrganizationService;

  beforeEach(() => {
    store = new MemoryOrganizationStore();
    service = makeService(store);
  });

  // Organizations

  it('createOrganization: succeeds with unique code', async () => {
    const org = await service.createOrganization({ name: 'Acme', code: 'ACME' });
    expect(org.id).toBeDefined();
    expect(org.name).toBe('Acme');
  });

  it('createOrganization: throws ConflictException for duplicate code', async () => {
    await service.createOrganization({ name: 'Acme', code: 'ACME' });
    await expect(service.createOrganization({ name: 'Acme2', code: 'ACME' })).rejects.toThrow(
      ConflictException,
    );
  });

  it('getOrganization: throws NotFoundException for missing id', async () => {
    await expect(service.getOrganization('ghost')).rejects.toThrow(NotFoundException);
  });

  it('listOrganizations: returns all without filter', async () => {
    await service.createOrganization({ name: 'A', code: 'A' });
    await service.createOrganization({ name: 'B', code: 'B' });
    const list = await service.listOrganizations();
    expect(list).toHaveLength(2);
  });

  it('updateOrganization: throws NotFoundException for missing id', async () => {
    await expect(service.updateOrganization('ghost', { name: 'X' })).rejects.toThrow(
      NotFoundException,
    );
  });

  it('updateOrganization: updates existing org', async () => {
    const org = await service.createOrganization({ name: 'Acme', code: 'ACME' });
    const updated = await service.updateOrganization(org.id, { description: 'Updated' });
    expect(updated.description).toBe('Updated');
  });

  // Departments

  it('createDepartment: throws NotFoundException for missing organizationId', async () => {
    await expect(
      service.createDepartment({ organizationId: 'ghost', name: 'Eng', code: 'ENG' }),
    ).rejects.toThrow(NotFoundException);
  });

  it('createDepartment: throws NotFoundException for missing parentId', async () => {
    const org = await service.createOrganization({ name: 'Acme', code: 'ACME' });
    await expect(
      service.createDepartment({ organizationId: org.id, name: 'Child', code: 'CHILD', parentId: 'ghost' }),
    ).rejects.toThrow(NotFoundException);
  });

  it('createDepartment: succeeds with valid parentId', async () => {
    const org = await service.createOrganization({ name: 'Acme', code: 'ACME' });
    const parent = await service.createDepartment({ organizationId: org.id, name: 'Eng', code: 'ENG' });
    const child = await service.createDepartment({
      organizationId: org.id,
      name: 'Frontend',
      code: 'FE',
      parentId: parent.id,
    });
    expect(child.parentId).toBe(parent.id);
  });

  it('getDepartment: throws NotFoundException for missing id', async () => {
    await expect(service.getDepartment('ghost')).rejects.toThrow(NotFoundException);
  });

  it('listDepartments: filter by organizationId isolates departments', async () => {
    const org1 = await service.createOrganization({ name: 'A', code: 'A' });
    const org2 = await service.createOrganization({ name: 'B', code: 'B' });
    await service.createDepartment({ organizationId: org1.id, name: 'D1', code: 'D1' });
    await service.createDepartment({ organizationId: org2.id, name: 'D2', code: 'D2' });
    const depts = await service.listDepartments({ organizationId: org1.id });
    expect(depts).toHaveLength(1);
    expect(depts[0].code).toBe('D1');
  });

  // Teams

  it('createTeam: throws NotFoundException for missing departmentId', async () => {
    await expect(
      service.createTeam({ departmentId: 'ghost', organizationId: 'org1', name: 'Alpha', code: 'ALPHA' }),
    ).rejects.toThrow(NotFoundException);
  });

  it('createTeam: succeeds with valid department', async () => {
    const org = await service.createOrganization({ name: 'Acme', code: 'ACME' });
    const dept = await service.createDepartment({ organizationId: org.id, name: 'Eng', code: 'ENG' });
    const team = await service.createTeam({
      departmentId: dept.id,
      organizationId: org.id,
      name: 'Alpha',
      code: 'ALPHA',
    });
    expect(team.departmentId).toBe(dept.id);
    expect(team.organizationId).toBe(org.id);
  });

  it('getTeam: throws NotFoundException for missing id', async () => {
    await expect(service.getTeam('ghost')).rejects.toThrow(NotFoundException);
  });

  it('listTeams: filter by departmentId', async () => {
    const org = await service.createOrganization({ name: 'Acme', code: 'ACME' });
    const dept1 = await service.createDepartment({ organizationId: org.id, name: 'Eng', code: 'ENG' });
    const dept2 = await service.createDepartment({ organizationId: org.id, name: 'Design', code: 'DES' });
    await service.createTeam({ departmentId: dept1.id, organizationId: org.id, name: 'Alpha', code: 'ALPHA' });
    await service.createTeam({ departmentId: dept2.id, organizationId: org.id, name: 'Beta', code: 'BETA' });
    const teams = await service.listTeams({ departmentId: dept1.id });
    expect(teams).toHaveLength(1);
    expect(teams[0].code).toBe('ALPHA');
  });

  // Memberships

  it('addMember: throws NotFoundException for missing organizationId', async () => {
    await expect(
      service.addMember({ userId: 'u1', organizationId: 'ghost', joinedAt: new Date() }),
    ).rejects.toThrow(NotFoundException);
  });

  it('addMember + removeMember: membership lifecycle', async () => {
    const org = await service.createOrganization({ name: 'Acme', code: 'ACME' });
    await service.addMember({ userId: 'u1', organizationId: org.id, joinedAt: new Date() });
    expect(await service.isUserInOrganization('u1', org.id)).toBe(true);
    await service.removeMember('u1', org.id);
    expect(await service.isUserInOrganization('u1', org.id)).toBe(false);
  });

  it('isUserInOrganization: returns false for user in different org', async () => {
    const org1 = await service.createOrganization({ name: 'A', code: 'A' });
    const org2 = await service.createOrganization({ name: 'B', code: 'B' });
    await service.addMember({ userId: 'u1', organizationId: org1.id, joinedAt: new Date() });
    expect(await service.isUserInOrganization('u1', org2.id)).toBe(false);
  });

  it('isUserInDepartment: returns true only for matching departmentId', async () => {
    const org = await service.createOrganization({ name: 'Acme', code: 'ACME' });
    const dept = await service.createDepartment({ organizationId: org.id, name: 'Eng', code: 'ENG' });
    await service.addMember({
      userId: 'u1',
      organizationId: org.id,
      departmentId: dept.id,
      joinedAt: new Date(),
    });
    expect(await service.isUserInDepartment('u1', dept.id)).toBe(true);
    expect(await service.isUserInDepartment('u1', 'other-dept')).toBe(false);
  });

  it('isUserInTeam: returns true only for matching teamId', async () => {
    const org = await service.createOrganization({ name: 'Acme', code: 'ACME' });
    const dept = await service.createDepartment({ organizationId: org.id, name: 'Eng', code: 'ENG' });
    const team = await service.createTeam({
      departmentId: dept.id,
      organizationId: org.id,
      name: 'Alpha',
      code: 'ALPHA',
    });
    await service.addMember({
      userId: 'u1',
      organizationId: org.id,
      teamId: team.id,
      joinedAt: new Date(),
    });
    expect(await service.isUserInTeam('u1', team.id)).toBe(true);
    expect(await service.isUserInTeam('u1', 'other-team')).toBe(false);
  });

  // Cross-org isolation

  it('members do not leak across organizations', async () => {
    const org1 = await service.createOrganization({ name: 'A', code: 'A' });
    const org2 = await service.createOrganization({ name: 'B', code: 'B' });
    await service.addMember({ userId: 'u1', organizationId: org1.id, joinedAt: new Date() });
    await service.addMember({ userId: 'u2', organizationId: org2.id, joinedAt: new Date() });

    const members1 = await service.getOrganizationMembers(org1.id);
    const members2 = await service.getOrganizationMembers(org2.id);

    expect(members1.map(m => m.userId)).toEqual(['u1']);
    expect(members2.map(m => m.userId)).toEqual(['u2']);
  });

  it('departments do not leak across organizations', async () => {
    const org1 = await service.createOrganization({ name: 'A', code: 'A' });
    const org2 = await service.createOrganization({ name: 'B', code: 'B' });
    await service.createDepartment({ organizationId: org1.id, name: 'D1', code: 'D1' });
    await service.createDepartment({ organizationId: org2.id, name: 'D2', code: 'D2' });

    const depts1 = await service.listDepartments({ organizationId: org1.id });
    const depts2 = await service.listDepartments({ organizationId: org2.id });

    expect(depts1).toHaveLength(1);
    expect(depts2).toHaveLength(1);
  });
});

// ─── Constants ───────────────────────────────────────────────────────────────

describe('Organization constants', () => {
  it('ORGANIZATION_STORE token is defined', () => {
    expect(ORGANIZATION_STORE).toBe('BOOT_ORGANIZATION_STORE');
  });
});
