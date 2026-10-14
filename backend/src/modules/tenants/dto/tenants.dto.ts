import {
  IsEnum,
  IsISO31661Alpha2,
  IsOptional,
  IsPhoneNumber,
  IsString,
  MaxLength,
} from 'class-validator';
import { KycStatus, TenantStatus } from '../../../generated/prisma/enums';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';

export class UpdateTenantProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  alternatePhone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  addressLine1?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  addressLine2?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  state?: string;

  @IsOptional()
  @IsString()
  @MaxLength(24)
  postalCode?: string;

  @IsOptional()
  @IsISO31661Alpha2()
  countryCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  emergencyContactName?: string;

  @IsOptional()
  @IsPhoneNumber()
  emergencyContactPhone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  emergencyContactRelation?: string;
}

export class UpdateTenantStatusDto {
  @IsEnum(TenantStatus)
  status!: TenantStatus;
}

export class UpdateKycDto {
  @IsEnum(KycStatus)
  kycStatus!: KycStatus;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  kycReference?: string;
}

export class SearchTenantsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(TenantStatus)
  status?: TenantStatus;

  @IsOptional()
  @IsEnum(KycStatus)
  kycStatus?: KycStatus;

  @IsOptional()
  @IsString()
  @MaxLength(320)
  search?: string;
}
