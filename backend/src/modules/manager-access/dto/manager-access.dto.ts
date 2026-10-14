import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsOptional,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { ManagerPermission, UserRole } from '../../../generated/prisma/enums';

export class CreateAssignmentDto {
  @IsUUID()
  managerUserId!: string;

  @IsEnum(UserRole)
  managerRole?: UserRole = UserRole.PROPERTY_MANAGER;

  @IsDateString()
  startDate!: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsArray()
  @ArrayMaxSize(20)
  permissions!: ManagerPermission[];
}

export class UpdateAssignmentPermissionsDto {
  @IsArray()
  @ArrayMaxSize(20)
  permissions!: ManagerPermission[];
}

export class AssignmentInputDto {
  @IsUUID()
  managerUserId!: string;

  @IsArray()
  @ArrayMaxSize(20)
  permissions!: ManagerPermission[];

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}

export class BulkAssignDto {
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => AssignmentInputDto)
  assignments!: AssignmentInputDto[];
}
