import { Injectable, Inject, NotFoundException, ConflictException } from '@nestjs/common';
import { ORGANIZATION_STORE } from './constants';
import {
  OrganizationStore,
  OrganizationEntity,
  DepartmentEntity,
  TeamEntity,
  UserOrganizationMembership,
} from './interfaces';

@Injectable()
export class OrganizationService {
  constructor(
    @Inject(ORGANIZATION_STORE) private readonly store: OrganizationStore,
  ) {}

  // ── Organizations ──────────────────────────────────────────────────────────

  async createOrganization(data: Partial<OrganizationEntity>): Promise<OrganizationEntity> {
    if (data.code) {
      const existing = await this.store.findOrganizations({ code: data.code });
      if (existing.length > 0) {
        throw new ConflictException(`Organization code "${data.code}" already exists`);
      }
    }
    return this.store.createOrganization(data);
  }

  async getOrganization(id: string): Promise<OrganizationEntity> {
    const org = await this.store.findOrganization(id);
    if (!org) throw new NotFoundException(`Organization ${id} not found`);
    return org;
  }

  async listOrganizations(filter?: Record<string, any>): Promise<OrganizationEntity[]> {
    return this.store.findOrganizations(filter);
  }

  async updateOrganization(
    id: string,
    data: Partial<OrganizationEntity>,
  ): Promise<OrganizationEntity> {
    await this.getOrganization(id);
    return this.store.updateOrganization(id, data);
  }

  // ── Departments ────────────────────────────────────────────────────────────

  async createDepartment(data: Partial<DepartmentEntity>): Promise<DepartmentEntity> {
    if (data.organizationId) await this.getOrganization(data.organizationId);
    if (data.parentId) {
      const parent = await this.store.findDepartment(data.parentId);
      if (!parent) throw new NotFoundException(`Parent department ${data.parentId} not found`);
    }
    return this.store.createDepartment(data);
  }

  async getDepartment(id: string): Promise<DepartmentEntity> {
    const dept = await this.store.findDepartment(id);
    if (!dept) throw new NotFoundException(`Department ${id} not found`);
    return dept;
  }

  async listDepartments(filter?: Record<string, any>): Promise<DepartmentEntity[]> {
    return this.store.findDepartments(filter);
  }

  async updateDepartment(
    id: string,
    data: Partial<DepartmentEntity>,
  ): Promise<DepartmentEntity> {
    await this.getDepartment(id);
    return this.store.updateDepartment(id, data);
  }

  // ── Teams ──────────────────────────────────────────────────────────────────

  async createTeam(data: Partial<TeamEntity>): Promise<TeamEntity> {
    if (data.departmentId) await this.getDepartment(data.departmentId);
    return this.store.createTeam(data);
  }

  async getTeam(id: string): Promise<TeamEntity> {
    const team = await this.store.findTeam(id);
    if (!team) throw new NotFoundException(`Team ${id} not found`);
    return team;
  }

  async listTeams(filter?: Record<string, any>): Promise<TeamEntity[]> {
    return this.store.findTeams(filter);
  }

  async updateTeam(id: string, data: Partial<TeamEntity>): Promise<TeamEntity> {
    await this.getTeam(id);
    return this.store.updateTeam(id, data);
  }

  // ── Memberships ────────────────────────────────────────────────────────────

  async addMember(membership: UserOrganizationMembership): Promise<void> {
    await this.getOrganization(membership.organizationId);
    return this.store.addMember(membership);
  }

  async removeMember(userId: string, organizationId: string): Promise<void> {
    return this.store.removeMember(userId, organizationId);
  }

  async getUserMemberships(userId: string): Promise<UserOrganizationMembership[]> {
    return this.store.getUserMemberships(userId);
  }

  async getOrganizationMembers(organizationId: string): Promise<UserOrganizationMembership[]> {
    return this.store.getOrganizationMembers(organizationId);
  }

  async getDepartmentMembers(departmentId: string): Promise<UserOrganizationMembership[]> {
    return this.store.getDepartmentMembers(departmentId);
  }

  async getTeamMembers(teamId: string): Promise<UserOrganizationMembership[]> {
    return this.store.getTeamMembers(teamId);
  }

  /** Check if user belongs to organization */
  async isUserInOrganization(userId: string, organizationId: string): Promise<boolean> {
    const memberships = await this.store.getUserMemberships(userId);
    return memberships.some(m => m.organizationId === organizationId);
  }

  /** Check if user belongs to department */
  async isUserInDepartment(userId: string, departmentId: string): Promise<boolean> {
    const memberships = await this.store.getUserMemberships(userId);
    return memberships.some(m => m.departmentId === departmentId);
  }

  /** Check if user belongs to team */
  async isUserInTeam(userId: string, teamId: string): Promise<boolean> {
    const memberships = await this.store.getUserMemberships(userId);
    return memberships.some(m => m.teamId === teamId);
  }
}
