import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Req,
} from '@nestjs/common';
import { Permissions, RequireScope, AccessScope } from 'nestjs-boot';
import { OrganizationsService } from './organizations.service';
import {
  CreateOrganizationDto,
  UpdateOrganizationDto,
  CreateDepartmentDto,
  UpdateDepartmentDto,
  CreateTeamDto,
  UpdateTeamDto,
  AddMemberDto,
} from './dto/organization.dto';

@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly service: OrganizationsService) {}

  // ────────────────────────────────────────────────────────────
  // Organizations
  // ────────────────────────────────────────────────────────────

  @Get()
  @Permissions('organization.read')
  findAll() {
    return this.service.findAllOrganizations();
  }

  @Post()
  @Permissions('organization.create')
  @RequireScope(AccessScope.SYSTEM)
  create(@Body() dto: CreateOrganizationDto, @Req() req: any) {
    return this.service.createOrganization(dto, req.user?.id ?? 'system');
  }

  @Get(':id')
  @Permissions('organization.read')
  findById(@Param('id') id: string) {
    return this.service.findOrganizationById(id);
  }

  @Patch(':id')
  @Permissions('organization.update')
  update(@Param('id') id: string, @Body() dto: UpdateOrganizationDto, @Req() req: any) {
    return this.service.updateOrganization(id, dto, req.user?.id ?? 'system');
  }

  // ────────────────────────────────────────────────────────────
  // Departments
  // ────────────────────────────────────────────────────────────

  @Get(':orgId/departments')
  @Permissions('department.read')
  findDepartments(@Param('orgId') orgId: string) {
    return this.service.findDepartmentsByOrg(orgId);
  }

  @Post(':orgId/departments')
  @Permissions('department.create')
  @RequireScope(AccessScope.ORGANIZATION)
  createDepartment(
    @Param('orgId') orgId: string,
    @Body() dto: CreateDepartmentDto,
    @Req() req: any,
  ) {
    // Ensure organizationId from path takes precedence
    return this.service.createDepartment({ ...dto, organizationId: orgId }, req.user?.id ?? 'system');
  }

  @Patch('departments/:id')
  @Permissions('department.update')
  updateDepartment(
    @Param('id') id: string,
    @Body() dto: UpdateDepartmentDto,
    @Req() req: any,
  ) {
    return this.service.updateDepartment(id, dto, req.user?.id ?? 'system');
  }

  // ────────────────────────────────────────────────────────────
  // Teams
  // ────────────────────────────────────────────────────────────

  @Get('departments/:deptId/teams')
  @Permissions('team.read')
  findTeams(@Param('deptId') deptId: string) {
    return this.service.findTeamsByDepartment(deptId);
  }

  @Post('departments/:deptId/teams')
  @Permissions('team.create')
  @RequireScope(AccessScope.DEPARTMENT)
  createTeam(
    @Param('deptId') deptId: string,
    @Body() dto: CreateTeamDto,
    @Req() req: any,
  ) {
    return this.service.createTeam({ ...dto, departmentId: deptId }, req.user?.id ?? 'system');
  }

  @Patch('teams/:id')
  @Permissions('team.update')
  updateTeam(
    @Param('id') id: string,
    @Body() dto: UpdateTeamDto,
    @Req() req: any,
  ) {
    return this.service.updateTeam(id, dto, req.user?.id ?? 'system');
  }

  // ────────────────────────────────────────────────────────────
  // Memberships
  // ────────────────────────────────────────────────────────────

  @Post(':orgId/members')
  @Permissions('organization.manage')
  addMember(
    @Param('orgId') orgId: string,
    @Body() dto: AddMemberDto,
    @Req() req: any,
  ) {
    return this.service.addMember(orgId, dto, req.user?.id ?? 'system');
  }

  @Delete(':orgId/members/:userId')
  @Permissions('organization.manage')
  removeMember(
    @Param('orgId') orgId: string,
    @Param('userId') userId: string,
    @Req() req: any,
  ) {
    return this.service.removeMember(orgId, userId, req.user?.id ?? 'system');
  }

  @Get(':orgId/members')
  @Permissions('organization.read')
  getMembers(
    @Param('orgId') orgId: string,
    @Query('departmentId') departmentId?: string,
    @Query('teamId') teamId?: string,
  ) {
    return this.service.getMembers(orgId, departmentId, teamId);
  }
}
