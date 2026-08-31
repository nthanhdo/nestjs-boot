import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
} from '@nestjs/common';
import { Permissions, CurrentUser, RequireScope, AccessScope } from 'nestjs-boot';
import { UsersService } from './users.service';
import { CreateUserDto, UpdateUserDto, AssignRoleDto, UserFilterDto } from './dto/user.dto';

interface JwtPayload {
  sub: string;
  email: string;
  roles: string[];
  permissions: string[];
  organizationId: string | null;
  departmentId: string | null;
  teamId: string | null;
}

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @Permissions('user.read')
  @RequireScope(AccessScope.ORGANIZATION)
  findAll(@Query() filter: UserFilterDto) {
    return this.usersService.findAll(filter);
  }

  @Get(':id')
  @Permissions('user.read')
  findById(@Param('id') id: string) {
    return this.usersService.findById(id);
  }

  @Post()
  @Permissions('user.create')
  create(@Body() dto: CreateUserDto, @CurrentUser() user: JwtPayload) {
    return this.usersService.create(dto, user?.roles);
  }

  @Patch(':id')
  @Permissions('user.update')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.usersService.update(id, dto, user?.roles);
  }

  @Delete(':id')
  @Permissions('user.delete')
  @RequireScope(AccessScope.ORGANIZATION)
  delete(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.usersService.delete(id, user?.roles);
  }

  @Post(':id/roles')
  @Permissions('role.manage')
  assignRole(
    @Param('id') id: string,
    @Body() dto: AssignRoleDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.usersService.assignRole(id, dto.roleCode, user?.roles);
  }

  @Delete(':id/roles/:roleCode')
  @Permissions('role.manage')
  removeRole(
    @Param('id') id: string,
    @Param('roleCode') roleCode: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.usersService.removeRole(id, roleCode, user?.roles);
  }
}
