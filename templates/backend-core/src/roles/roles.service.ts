import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService, PrivilegeBoundary } from 'nestjs-boot';
import { AuditService } from 'nestjs-boot';
import { CreateRoleDto, UpdateRoleDto } from './dto/role.dto';

interface RolePermission {
  id: string;
  code: string;
  name: string;
  resource: string;
  action: string;
}

interface RoleWithRelations {
  id: string;
  code: string;
  name: string;
  description: string | null;
  level: number;
  isSystem: boolean;
  permissions: RolePermission[];
  inherits: Array<{ code: string; name: string; permissions?: RolePermission[] }>;
}

@Injectable()
export class RolesService {
  private readonly boundary: PrivilegeBoundary;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {
    this.boundary = new PrivilegeBoundary();
  }

  /** Sync role definitions from DB into PrivilegeBoundary for level checks */
  private async syncBoundary(): Promise<void> {
    const allRoles = await this.prisma.client.role.findMany({
      select: { code: true, level: true },
    });
    for (const r of allRoles) {
      this.boundary.define({ name: r.code, level: r.level });
    }
  }

  async findAll() {
    return this.prisma.client.role.findMany({
      include: {
        permissions: { select: { code: true, name: true, resource: true, action: true } },
        inherits: { select: { code: true, name: true } },
      },
      orderBy: { level: 'desc' },
    });
  }

  async findById(code: string): Promise<RoleWithRelations> {
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

    return role as unknown as RoleWithRelations;
  }

  async create(dto: CreateRoleDto, actorRoles?: string[]) {
    const existing = await this.prisma.client.role.findUnique({
      where: { code: dto.code },
    });
    if (existing) {
      throw new BadRequestException(`Role code ${dto.code} already exists`);
    }

    // Privilege boundary: actor must have higher level than the role being created
    if (actorRoles) {
      await this.syncBoundary();
      // Register the new role temporarily to check level
      this.boundary.define({ name: dto.code, level: dto.level ?? 10 });
      this.boundary.enforceAssignment(actorRoles, dto.code);
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

    if (role.isSystem && !actorRoles?.includes('super_admin')) {
      throw new ForbiddenException('Cannot modify a system role');
    }

    // Privilege boundary: actor must have higher level than the target role
    if (actorRoles) {
      await this.syncBoundary();
      this.boundary.enforceAssignment(actorRoles, code);
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
      await this.setPermissions(role.id, dto.permissions);
    }

    if (dto.inherits !== undefined) {
      await this.setInherits(role.id, dto.inherits);
    }

    return this.findById(code);
  }

  async delete(code: string, actorRoles?: string[]) {
    const role = await this.findById(code);

    if (role.isSystem) {
      throw new ForbiddenException('Cannot delete a system role');
    }

    // Privilege boundary: actor must have higher level than the role being deleted
    if (actorRoles) {
      await this.syncBoundary();
      this.boundary.enforceAssignment(actorRoles, code);
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

    const direct = role.permissions ?? [];
    const inherited = role.inherits?.flatMap((r) => r.permissions ?? []) ?? [];

    const all = [...direct, ...inherited];
    const unique = [...new Map(all.map((p) => [p.code, p])).values()];

    return {
      role: { code: role.code, name: role.name },
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

    const foundCodes = new Set(perms.map((p: { code: string }) => p.code));
    const missing = permissionCodes.filter((c) => !foundCodes.has(c));
    if (missing.length) {
      throw new NotFoundException(`Permissions not found: ${missing.join(', ')}`);
    }

    await this.prisma.client.rolePermission.deleteMany({ where: { roleId } });

    await this.prisma.client.rolePermission.createMany({
      data: perms.map((p: { id: string }) => ({ roleId, permissionId: p.id })),
    });
  }

  private async setInherits(roleId: string, inheritCodes: string[]) {
    const roles = await this.prisma.client.role.findMany({
      where: { code: { in: inheritCodes } },
    });

    const foundCodes = new Set(roles.map((r: { code: string }) => r.code));
    const missing = inheritCodes.filter((c) => !foundCodes.has(c));
    if (missing.length) {
      throw new NotFoundException(`Inherited roles not found: ${missing.join(', ')}`);
    }

    // Many-to-many: roleInherits join table
    await this.prisma.client.roleInheritance.deleteMany({ where: { childId: roleId } });

    await this.prisma.client.roleInheritance.createMany({
      data: roles.map((r: { id: string }) => ({ childId: roleId, parentId: r.id })),
    });
  }
}
