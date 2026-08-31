export interface OrganizationEntity {
  id: string;
  name: string;
  code: string;
  description?: string;
  isActive: boolean;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface DepartmentEntity {
  id: string;
  organizationId: string;
  name: string;
  code: string;
  description?: string;
  parentId?: string;
  isActive: boolean;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface TeamEntity {
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

export interface UserOrganizationMembership {
  userId: string;
  organizationId: string;
  departmentId?: string;
  teamId?: string;
  role?: string;
  joinedAt: Date;
}

/**
 * OrganizationStore — abstraction for org hierarchy persistence.
 * Implement with Mongoose, Prisma, or any other ORM.
 */
export interface OrganizationStore {
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

export interface OrganizationModuleOptions {
  store?: OrganizationStore;
}
