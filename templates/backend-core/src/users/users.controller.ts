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
import { PaginationDto } from '../common/dto/pagination.dto';
import { CreateUserDto, UpdateUserDto, AssignRoleDto } from './dto/user.dto';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @Permissions('user.read')
  @RequireScope(AccessScope.ORGANIZATION)
  findAll(@Query() pagination: PaginationDto) {
    return this.usersService.findAll(pagination);
  }

  @Get(':id')
  @Permissions('user.read')
  findById(@Param('id') id: string) {
    return this.usersService.findById(id);
  }

  @Post()
  @Permissions('user.create')
  create(@Body() dto: CreateUserDto, @CurrentUser() user: any) {
    return this.usersService.create(dto, user?.roles);
  }

  @Patch(':id')
  @Permissions('user.update')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() user: any,
  ) {
    return this.usersService.update(id, dto, user?.roles);
  }

  @Delete(':id')
  @Permissions('user.delete')
  @RequireScope(AccessScope.ORGANIZATION)
  delete(@Param('id') id: string, @CurrentUser() user: any) {
    return this.usersService.delete(id, user?.roles);
  }

  @Post(':id/roles')
  @Permissions('role.manage')
  assignRole(
    @Param('id') id: string,
    @Body() dto: AssignRoleDto,
    @CurrentUser() user: any,
  ) {
    return this.usersService.assignRole(id, dto.roleCode, user?.roles);
  }

  @Delete(':id/roles/:roleCode')
  @Permissions('role.manage')
  removeRole(
    @Param('id') id: string,
    @Param('roleCode') roleCode: string,
    @CurrentUser() user: any,
  ) {
    return this.usersService.removeRole(id, roleCode, user?.roles);
  }
}
