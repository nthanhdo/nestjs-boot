import {
  IsString,
  IsOptional,
  IsBoolean,
  IsUUID,
  MinLength,
  MaxLength,
  Matches,
} from 'class-validator';

// ────────────────────────────────────────────────────────────
// Organization
// ────────────────────────────────────────────────────────────

export class CreateOrganizationDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name: string;

  @IsString()
  @Matches(/^[A-Z0-9_-]+$/, { message: 'code must be uppercase alphanumeric (A-Z, 0-9, _ -)' })
  @MinLength(2)
  @MaxLength(32)
  code: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

export class UpdateOrganizationDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

// ────────────────────────────────────────────────────────────
// Department
// ────────────────────────────────────────────────────────────

export class CreateDepartmentDto {
  @IsUUID()
  organizationId: string;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name: string;

  @IsString()
  @Matches(/^[A-Z0-9_-]+$/, { message: 'code must be uppercase alphanumeric (A-Z, 0-9, _ -)' })
  @MinLength(2)
  @MaxLength(32)
  code: string;

  @IsOptional()
  @IsUUID()
  parentId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

export class UpdateDepartmentDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

// ────────────────────────────────────────────────────────────
// Team
// ────────────────────────────────────────────────────────────

export class CreateTeamDto {
  @IsUUID()
  departmentId: string;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name: string;

  @IsString()
  @Matches(/^[A-Z0-9_-]+$/, { message: 'code must be uppercase alphanumeric (A-Z, 0-9, _ -)' })
  @MinLength(2)
  @MaxLength(32)
  code: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

export class UpdateTeamDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

// ────────────────────────────────────────────────────────────
// Membership
// ────────────────────────────────────────────────────────────

export class AddMemberDto {
  @IsUUID()
  userId: string;

  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @IsOptional()
  @IsUUID()
  teamId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  role?: string;
}
