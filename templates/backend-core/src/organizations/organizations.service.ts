import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from 'nestjs-boot';
import { AuditService } from 'nestjs-boot';
import {
  CreateOrganizationDto,
  UpdateOrganizationDto,
  CreateDepartmentDto,
  UpdateDepartmentDto,
  CreateTeamDto,
  UpdateTeamDto,
  AddMemberDto,
} from './dto/organization.dto';

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ────────────────────────────────────────────────────────────
  // Organizations
  // ────────────────────────────────────────────────────────────

  async createOrganization(dto: CreateOrganizationDto, actorId: string) {
    const existing = await this.prisma.client.organization.findUnique({
      where: { code: dto.code },
    });
    if (existing) {
      throw new ConflictException(`Organization code '${dto.code}' is already in use`);
    }

    const org = await this.prisma.client.organization.create({
      data: {
        name: dto.name,
        code: dto.code,
        description: dto.description,
        isActive: true,
      },
    });

    await this.audit.log({
      actorId,
      action: 'organization.create',
      resource: 'organization',
      resourceId: org.id,
      result: 'ALLOW',
      metadata: { code: org.code },
    });

    return org;
  }

  async findAllOrganizations() {
    return this.prisma.client.organization.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  async findOrganizationById(id: string) {
    const org = await this.prisma.client.organization.findUnique({
      where: { id },
      include: {
        departments: {
          where: { isActive: true },
          include: {
            teams: { where: { isActive: true } },
          },
        },
      },
    });
    if (!org) throw new NotFoundException(`Organization '${id}' not found`);
    return org;
  }

  async updateOrganization(id: string, dto: UpdateOrganizationDto, actorId: string) {
    await this.findOrganizationById(id);

    const updated = await this.prisma.client.organization.update({
      where: { id },
      data: dto,
    });

    await this.audit.log({
      actorId,
      action: 'organization.update',
      resource: 'organization',
      resourceId: id,
      result: 'ALLOW',
      metadata: { changes: dto },
    });

    return updated;
  }

  async deactivateOrganization(id: string, actorId: string) {
    await this.findOrganizationById(id);

    const updated = await this.prisma.client.organization.update({
      where: { id },
      data: { isActive: false },
    });

    await this.audit.log({
      actorId,
      action: 'organization.deactivate',
      resource: 'organization',
      resourceId: id,
      result: 'ALLOW',
    });

    return updated;
  }

  // ────────────────────────────────────────────────────────────
  // Departments
  // ────────────────────────────────────────────────────────────

  async createDepartment(dto: CreateDepartmentDto, actorId: string) {
    // Validate org exists
    const org = await this.prisma.client.organization.findUnique({
      where: { id: dto.organizationId },
    });
    if (!org) throw new NotFoundException(`Organization '${dto.organizationId}' not found`);

    // Validate parentId if provided
    if (dto.parentId) {
      const parent = await this.prisma.client.department.findUnique({
        where: { id: dto.parentId },
      });
      if (!parent || parent.organizationId !== dto.organizationId) {
        throw new NotFoundException(`Parent department '${dto.parentId}' not found in this organization`);
      }
    }

    const dept = await this.prisma.client.department.create({
      data: {
        organizationId: dto.organizationId,
        name: dto.name,
        code: dto.code,
        description: dto.description,
        parentId: dto.parentId,
        isActive: true,
      },
    });

    await this.audit.log({
      actorId,
      action: 'department.create',
      resource: 'department',
      resourceId: dept.id,
      organizationId: dto.organizationId,
      result: 'ALLOW',
      metadata: { code: dept.code },
    });

    return dept;
  }

  async findDepartmentsByOrg(organizationId: string) {
    return this.prisma.client.department.findMany({
      where: { organizationId, isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  async findDepartmentById(id: string) {
    const dept = await this.prisma.client.department.findUnique({
      where: { id },
      include: {
        teams: { where: { isActive: true } },
      },
    });
    if (!dept) throw new NotFoundException(`Department '${id}' not found`);
    return dept;
  }

  async updateDepartment(id: string, dto: UpdateDepartmentDto, actorId: string) {
    const dept = await this.findDepartmentById(id);

    const updated = await this.prisma.client.department.update({
      where: { id },
      data: dto,
    });

    await this.audit.log({
      actorId,
      action: 'department.update',
      resource: 'department',
      resourceId: id,
      organizationId: dept.organizationId,
      result: 'ALLOW',
      metadata: { changes: dto },
    });

    return updated;
  }

  // ────────────────────────────────────────────────────────────
  // Teams
  // ────────────────────────────────────────────────────────────

  async createTeam(dto: CreateTeamDto, actorId: string) {
    const dept = await this.prisma.client.department.findUnique({
      where: { id: dto.departmentId },
    });
    if (!dept) throw new NotFoundException(`Department '${dto.departmentId}' not found`);

    const team = await this.prisma.client.team.create({
      data: {
        departmentId: dto.departmentId,
        organizationId: dept.organizationId,
        name: dto.name,
        code: dto.code,
        description: dto.description,
        isActive: true,
      },
    });

    await this.audit.log({
      actorId,
      action: 'team.create',
      resource: 'team',
      resourceId: team.id,
      organizationId: dept.organizationId,
      departmentId: dto.departmentId,
      result: 'ALLOW',
      metadata: { code: team.code },
    });

    return team;
  }

  async findTeamsByDepartment(departmentId: string) {
    return this.prisma.client.team.findMany({
      where: { departmentId, isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  async findTeamById(id: string) {
    const team = await this.prisma.client.team.findUnique({
      where: { id },
      include: {
        members: true,
      },
    });
    if (!team) throw new NotFoundException(`Team '${id}' not found`);
    return team;
  }

  async updateTeam(id: string, dto: UpdateTeamDto, actorId: string) {
    const team = await this.findTeamById(id);

    const updated = await this.prisma.client.team.update({
      where: { id },
      data: dto,
    });

    await this.audit.log({
      actorId,
      action: 'team.update',
      resource: 'team',
      resourceId: id,
      organizationId: team.organizationId,
      departmentId: team.departmentId,
      result: 'ALLOW',
      metadata: { changes: dto },
    });

    return updated;
  }

  // ────────────────────────────────────────────────────────────
  // Memberships
  // ────────────────────────────────────────────────────────────

  async addMember(organizationId: string, dto: AddMemberDto, actorId: string) {
    // Validate user exists
    const user = await this.prisma.client.user.findUnique({ where: { id: dto.userId } });
    if (!user) throw new NotFoundException(`User '${dto.userId}' not found`);

    // Validate org exists
    const org = await this.prisma.client.organization.findUnique({ where: { id: organizationId } });
    if (!org) throw new NotFoundException(`Organization '${organizationId}' not found`);

    const membership = await this.prisma.client.userOrganizationMembership.upsert({
      where: {
        userId_organizationId: { userId: dto.userId, organizationId },
      },
      create: {
        userId: dto.userId,
        organizationId,
        departmentId: dto.departmentId,
        teamId: dto.teamId,
        role: dto.role,
        joinedAt: new Date(),
      },
      update: {
        departmentId: dto.departmentId,
        teamId: dto.teamId,
        role: dto.role,
      },
    });

    await this.audit.log({
      actorId,
      action: 'organization.addMember',
      resource: 'membership',
      resourceId: dto.userId,
      organizationId,
      result: 'ALLOW',
      metadata: { role: dto.role, departmentId: dto.departmentId, teamId: dto.teamId },
    });

    return membership;
  }

  async removeMember(organizationId: string, userId: string, actorId: string) {
    await this.prisma.client.userOrganizationMembership.delete({
      where: {
        userId_organizationId: { userId, organizationId },
      },
    });

    await this.audit.log({
      actorId,
      action: 'organization.removeMember',
      resource: 'membership',
      resourceId: userId,
      organizationId,
      result: 'ALLOW',
    });
  }

  async getMembers(organizationId: string, departmentId?: string, teamId?: string) {
    const where: Record<string, any> = { organizationId };
    if (departmentId) where.departmentId = departmentId;
    if (teamId) where.teamId = teamId;

    return this.prisma.client.userOrganizationMembership.findMany({
      where,
      include: { user: { select: { id: true, email: true, name: true } } },
    });
  }

  async getUserMemberships(userId: string) {
    return this.prisma.client.userOrganizationMembership.findMany({
      where: { userId },
      include: {
        organization: { select: { id: true, name: true, code: true } },
      },
    });
  }
}
