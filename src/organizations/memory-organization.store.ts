import {
  OrganizationStore,
  OrganizationEntity,
  DepartmentEntity,
  TeamEntity,
  UserOrganizationMembership,
} from './interfaces';

export class MemoryOrganizationStore implements OrganizationStore {
  private organizations = new Map<string, OrganizationEntity>();
  private departments = new Map<string, DepartmentEntity>();
  private teams = new Map<string, TeamEntity>();
  private memberships: UserOrganizationMembership[] = [];
  private counter = 0;

  private nextId(): string {
    return `org_${++this.counter}`;
  }

  async createOrganization(data: Partial<OrganizationEntity>): Promise<OrganizationEntity> {
    const org: OrganizationEntity = {
      id: data.id ?? this.nextId(),
      name: data.name ?? '',
      code: data.code ?? '',
      description: data.description,
      isActive: data.isActive ?? true,
      metadata: data.metadata,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.organizations.set(org.id, org);
    return org;
  }

  async findOrganization(id: string): Promise<OrganizationEntity | null> {
    return this.organizations.get(id) ?? null;
  }

  async findOrganizations(filter?: Record<string, any>): Promise<OrganizationEntity[]> {
    let results = [...this.organizations.values()];
    if (filter) {
      results = results.filter(org =>
        Object.entries(filter).every(([k, v]) => (org as any)[k] === v),
      );
    }
    return results;
  }

  async updateOrganization(
    id: string,
    data: Partial<OrganizationEntity>,
  ): Promise<OrganizationEntity> {
    const org = this.organizations.get(id);
    if (!org) throw new Error(`Organization ${id} not found`);
    const updated = { ...org, ...data, updatedAt: new Date() };
    this.organizations.set(id, updated);
    return updated;
  }

  async createDepartment(data: Partial<DepartmentEntity>): Promise<DepartmentEntity> {
    const dept: DepartmentEntity = {
      id: data.id ?? this.nextId(),
      organizationId: data.organizationId ?? '',
      name: data.name ?? '',
      code: data.code ?? '',
      description: data.description,
      parentId: data.parentId,
      isActive: data.isActive ?? true,
      metadata: data.metadata,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.departments.set(dept.id, dept);
    return dept;
  }

  async findDepartment(id: string): Promise<DepartmentEntity | null> {
    return this.departments.get(id) ?? null;
  }

  async findDepartments(filter?: Record<string, any>): Promise<DepartmentEntity[]> {
    let results = [...this.departments.values()];
    if (filter) {
      results = results.filter(d =>
        Object.entries(filter).every(([k, v]) => (d as any)[k] === v),
      );
    }
    return results;
  }

  async updateDepartment(
    id: string,
    data: Partial<DepartmentEntity>,
  ): Promise<DepartmentEntity> {
    const dept = this.departments.get(id);
    if (!dept) throw new Error(`Department ${id} not found`);
    const updated = { ...dept, ...data, updatedAt: new Date() };
    this.departments.set(id, updated);
    return updated;
  }

  async createTeam(data: Partial<TeamEntity>): Promise<TeamEntity> {
    const team: TeamEntity = {
      id: data.id ?? this.nextId(),
      departmentId: data.departmentId ?? '',
      organizationId: data.organizationId ?? '',
      name: data.name ?? '',
      code: data.code ?? '',
      description: data.description,
      isActive: data.isActive ?? true,
      metadata: data.metadata,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.teams.set(team.id, team);
    return team;
  }

  async findTeam(id: string): Promise<TeamEntity | null> {
    return this.teams.get(id) ?? null;
  }

  async findTeams(filter?: Record<string, any>): Promise<TeamEntity[]> {
    let results = [...this.teams.values()];
    if (filter) {
      results = results.filter(t =>
        Object.entries(filter).every(([k, v]) => (t as any)[k] === v),
      );
    }
    return results;
  }

  async updateTeam(id: string, data: Partial<TeamEntity>): Promise<TeamEntity> {
    const team = this.teams.get(id);
    if (!team) throw new Error(`Team ${id} not found`);
    const updated = { ...team, ...data, updatedAt: new Date() };
    this.teams.set(id, updated);
    return updated;
  }

  async addMember(membership: UserOrganizationMembership): Promise<void> {
    // Remove existing membership for same user+org
    this.memberships = this.memberships.filter(
      m => !(m.userId === membership.userId && m.organizationId === membership.organizationId),
    );
    this.memberships.push({ ...membership, joinedAt: membership.joinedAt ?? new Date() });
  }

  async removeMember(userId: string, organizationId: string): Promise<void> {
    this.memberships = this.memberships.filter(
      m => !(m.userId === userId && m.organizationId === organizationId),
    );
  }

  async getUserMemberships(userId: string): Promise<UserOrganizationMembership[]> {
    return this.memberships.filter(m => m.userId === userId);
  }

  async getOrganizationMembers(organizationId: string): Promise<UserOrganizationMembership[]> {
    return this.memberships.filter(m => m.organizationId === organizationId);
  }

  async getDepartmentMembers(departmentId: string): Promise<UserOrganizationMembership[]> {
    return this.memberships.filter(m => m.departmentId === departmentId);
  }

  async getTeamMembers(teamId: string): Promise<UserOrganizationMembership[]> {
    return this.memberships.filter(m => m.teamId === teamId);
  }
}
