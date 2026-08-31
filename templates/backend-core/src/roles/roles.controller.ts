import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
} from '@nestjs/common';
import { Permissions, CurrentUser } from 'nestjs-boot';
import { RolesService } from './roles.service';
import { CreateRoleDto, UpdateRoleDto } from './dto/role.dto';

@Controller('roles')
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get()
  @Permissions('role.read')
  findAll() {
    return this.rolesService.findAll();
  }

  @Get('permissions/all')
  @Permissions('role.read')
  listPermissions() {
    return this.rolesService.listPermissions();
  }

  @Get(':code')
  @Permissions('role.read')
  findById(@Param('code') code: string) {
    return this.rolesService.findById(code);
  }

  @Post()
  @Permissions('role.manage')
  create(@Body() dto: CreateRoleDto, @CurrentUser() user: any) {
    return this.rolesService.create(dto, user?.roles);
  }

  @Patch(':code')
  @Permissions('role.manage')
  update(
    @Param('code') code: string,
    @Body() dto: UpdateRoleDto,
    @CurrentUser() user: any,
  ) {
    return this.rolesService.update(code, dto, user?.roles);
  }

  @Delete(':code')
  @Permissions('role.manage')
  delete(@Param('code') code: string, @CurrentUser() user: any) {
    return this.rolesService.delete(code, user?.roles);
  }
}
