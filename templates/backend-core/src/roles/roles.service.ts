import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from 'nestjs-boot';
import { AuditService } from 'nestjs-boot';
import { CreateRoleDto, UpdateRoleDto } from './dto/role.dto';

@Injectable()
export class RolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async findAll() {
    return this.prisma.client.role.findMany({
      include: {
        permissions: { select: { code: true, name: true, resource: true, action: true } },
        inherits: { select: { code: true, name: true } },
      },
      orderBy: { level: 'desc' },
    });
  }

  async findById(code: string) {
    const role = await this.prisma.client.role.findUnique({
      where: { code },
      include: {
        permissions: true,
        inherits: {
          include: { permissions: true },
        },
      },
    });

    if (!role) {
      throw new NotFoundException(`Role ${code} not found`);
    }

    return role;
  }

  async create(dto: CreateRoleDto, actorRoles?: string[]) {
    const existing = await this.prisma.client.role.findUnique({
      where: { code: dto.code },
    });
    if (existing) {
      throw new BadRequestException(`Role code ${dto.code} already exists`);
    }

    // Privilege boundary: only super_admin can create high-level roles
    if (actorRoles && !actorRoles.includes('super_admin') && (dto.level ?? 0) >= 100) {
      throw new ForbiddenException('Insufficient privilege to create a role at this level');
    }

    const role = await this.prisma.client.role.create({
      data: {
        code: dto.code,
        name: dto.name,
        description: dto.description,
        level: dto.level ?? 10,
        isSystem: false,
      },
    });

    if (dto.permissions?.length) {
      await this.setPermissions(role.id, dto.permissions);
    }

    if (dto.inherits?.length) {
      await this.setInherits(role.id, dto.inherits);
    }

    return this.findById(role.code);
  }

  async update(code: string, dto: UpdateRoleDto, actorRoles?: string[]) {
    const role = await this.findById(code);

    if ((role as any).isSystem && !actorRoles?.includes('super_admin')) {
      throw new ForbiddenException('Cannot modify a system role');
    }

    await this.prisma.client.role.update({
      where: { code },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.level !== undefined && { level: dto.level }),
      },
    });

    if (dto.permissions !== undefined) {
      await this.setPermissions((role as any).id, dto.permissions);
    }

    if (dto.inherits !== undefined) {
      await this.setInherits((role as any).id, dto.inherits);
    }

    return this.findById(code);
  }

  async delete(code: string, actorRoles?: string[]) {
    const role = await this.findById(code);

    if ((role as any).isSystem) {
      throw new ForbiddenException('Cannot delete a system role');
    }

    if (actorRoles && !actorRoles.includes('super_admin') && (role as any).level >= 100) {
      throw new ForbiddenException('Insufficient privilege to delete this role');
    }

    await this.prisma.client.role.delete({ where: { code } });

    return { message: `Role ${code} deleted` };
  }

  async listPermissions() {
    return this.prisma.client.permission.findMany({
      orderBy: [{ resource: 'asc' }, { action: 'asc' }],
    });
  }

  async getRolePermissions(code: string) {
    const role = await this.findById(code);

    const direct = (role as any).permissions ?? [];
    const inherited = (role as any).inherits?.flatMap((r: any) => r.permissions ?? []) ?? [];

    const all = [...direct, ...inherited];
    const unique = [...new Map(all.map((p: any) => [p.code, p])).values()];

    return {
      role: { code: (role as any).code, name: (role as any).name },
      direct,
      inherited,
      all: unique,
    };
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private async setPermissions(roleId: string, permissionCodes: string[]) {
    const perms = await this.prisma.client.permission.findMany({
      where: { code: { in: permissionCodes } },
    });

    const foundCodes = new Set(perms.map((p: any) => p.code));
    const missing = permissionCodes.filter((c) => !foundCodes.has(c));
    if (missing.length) {
      throw new NotFoundException(`Permissions not found: ${missing.join(', ')}`);
    }

    await this.prisma.client.rolePermission.deleteMany({ where: { roleId } });

    await this.prisma.client.rolePermission.createMany({
      data: perms.map((p: any) => ({ roleId, permissionId: p.id })),
    });
  }

  private async setInherits(roleId: string, inheritCodes: string[]) {
    const roles = await this.prisma.client.role.findMany({
      where: { code: { in: inheritCodes } },
    });

    const foundCodes = new Set(roles.map((r: any) => r.code));
    const missing = inheritCodes.filter((c) => !foundCodes.has(c));
    if (missing.length) {
      throw new NotFoundException(`Inherited roles not found: ${missing.join(', ')}`);
    }

    // Many-to-many: roleInherits join table
    await this.prisma.client.roleInheritance.deleteMany({ where: { childId: roleId } });

    await this.prisma.client.roleInheritance.createMany({
      data: roles.map((r: any) => ({ childId: roleId, parentId: r.id })),
    });
  }
}
