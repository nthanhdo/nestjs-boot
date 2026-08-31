import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from 'nestjs-boot';
import { AuditService } from 'nestjs-boot';
import { PaginationDto } from '../common/dto/pagination.dto';
import { CreateUserDto, UpdateUserDto } from './dto/user.dto';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private parsePagination(dto: PaginationDto) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const [sortField, sortDir] = (dto.sort ?? 'createdAt:desc').split(':');
    return {
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { [sortField]: sortDir === 'asc' ? 'asc' : 'desc' },
    };
  }

  async findAll(pagination: PaginationDto) {
    const { skip, take, orderBy } = this.parsePagination(pagination);

    const [items, total] = await Promise.all([
      this.prisma.client.user.findMany({
        skip,
        take,
        orderBy,
        select: {
          id: true,
          email: true,
          name: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          roles: {
            include: { role: { select: { code: true, name: true, level: true } } },
          },
        },
      }),
      this.prisma.client.user.count(),
    ]);

    return {
      items,
      total,
      page: pagination.page ?? 1,
      limit: take,
      pages: Math.ceil(total / take),
    };
  }

  async findById(id: string) {
    const user = await this.prisma.client.user.findUnique({
      where: { id },
      include: {
        roles: {
          include: {
            role: {
              include: { permissions: true },
            },
          },
        },
        memberships: {
          include: { organization: true },
          where: { status: 'ACTIVE' },
        },
      },
    });

    if (!user) {
      throw new NotFoundException(`User ${id} not found`);
    }

    const { passwordHash, ...result } = user;
    return result;
  }

  async create(dto: CreateUserDto, actorRoles?: string[]) {
    const existing = await this.prisma.client.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      throw new BadRequestException('Email already registered');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);

    const user = await this.prisma.client.user.create({
      data: {
        email: dto.email,
        passwordHash,
        name: dto.name,
      },
      select: {
        id: true,
        email: true,
        name: true,
        status: true,
        createdAt: true,
      },
    });

    if (dto.roles?.length) {
      for (const roleCode of dto.roles) {
        await this.assignRole(user.id, roleCode, actorRoles);
      }
    }

    return this.findById(user.id);
  }

  async update(id: string, dto: UpdateUserDto, actorRoles?: string[]) {
    await this.findById(id);

    const updated = await this.prisma.client.user.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.status !== undefined && { status: dto.status }),
      },
      select: {
        id: true,
        email: true,
        name: true,
        status: true,
        updatedAt: true,
      },
    });

    return updated;
  }

  async delete(id: string, actorRoles?: string[]) {
    const user = await this.findById(id);

    // Check privilege boundary — cannot delete user with higher roles
    if (actorRoles && !actorRoles.includes('super_admin')) {
      const userRoles = (user as any).roles?.map((ur: any) => ur.role?.code) ?? [];
      if (userRoles.includes('super_admin') || userRoles.includes('admin')) {
        throw new ForbiddenException('Insufficient privilege to delete this user');
      }
    }

    await this.prisma.client.user.update({
      where: { id },
      data: { status: 'INACTIVE' },
    });

    return { message: 'User deactivated successfully' };
  }

  async assignRole(userId: string, roleCode: string, actorRoles?: string[]) {
    const role = await this.prisma.client.role.findUnique({
      where: { code: roleCode },
    });
    if (!role) {
      throw new NotFoundException(`Role ${roleCode} not found`);
    }

    // Privilege boundary: only super_admin can assign admin-level roles
    if (actorRoles && !actorRoles.includes('super_admin') && roleCode === 'super_admin') {
      throw new ForbiddenException('Cannot assign super_admin role');
    }

    await this.prisma.client.userRole.upsert({
      where: { userId_roleId: { userId, roleId: role.id } },
      create: { userId, roleId: role.id },
      update: {},
    });

    await this.audit.logAccess(userId, 'ROLE_ASSIGNED', 'user', userId, { roleCode });

    return { message: `Role ${roleCode} assigned` };
  }

  async removeRole(userId: string, roleCode: string, actorRoles?: string[]) {
    const role = await this.prisma.client.role.findUnique({
      where: { code: roleCode },
    });
    if (!role) {
      throw new NotFoundException(`Role ${roleCode} not found`);
    }

    await this.prisma.client.userRole.deleteMany({
      where: { userId, roleId: role.id },
    });

    await this.audit.logAccess(userId, 'ROLE_REMOVED', 'user', userId, { roleCode });

    return { message: `Role ${roleCode} removed` };
  }

  async getUserPermissions(userId: string) {
    const user = await this.prisma.client.user.findUnique({
      where: { id: userId },
      include: {
        roles: {
          include: {
            role: {
              include: {
                permissions: true,
                inherits: {
                  include: { permissions: true },
                },
              },
            },
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException(`User ${userId} not found`);
    }

    const permissionsSet = new Set<string>();

    for (const userRole of (user as any).roles ?? []) {
      const role = userRole.role;
      // Direct role permissions
      for (const perm of role.permissions ?? []) {
        permissionsSet.add(perm.code);
      }
      // Inherited role permissions
      for (const inherited of role.inherits ?? []) {
        for (const perm of inherited.permissions ?? []) {
          permissionsSet.add(perm.code);
        }
      }
    }

    return { userId, permissions: [...permissionsSet] };
  }
}
