import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsISO4217CurrencyCode,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Max,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { AgreementStatus } from '../../../generated/prisma/enums';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';

export class AgreementTenantInputDto {
  @IsUUID()
  tenantId!: string;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;

  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;
}

export class CreateAgreementDto {
  @IsUUID()
  roomId!: string;

  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  monthlyRentAmount!: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  securityDepositAmount!: number;

  @IsOptional()
  @IsISO4217CurrencyCode()
  currency?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  noticePeriodDays?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => AgreementTenantInputDto)
  tenants!: AgreementTenantInputDto[];
}

export class UpdateAgreementDto {
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  monthlyRentAmount?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  securityDepositAmount?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  noticePeriodDays?: number;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}

export class ActivateAgreementDto {
  @IsOptional()
  @IsDateString()
  startDate?: string;
}

export class TerminateAgreementDto {
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;

  @IsOptional()
  @IsDateString()
  terminatedAt?: string;
}

export class ListAgreementsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(AgreementStatus)
  status?: AgreementStatus;

  @IsOptional()
  @IsUUID()
  roomId?: string;

  @IsOptional()
  @IsUUID()
  propertyId?: string;

  @IsOptional()
  @IsUUID()
  tenantId?: string;

  @IsOptional()
  @IsDateString()
  endingBefore?: string;
}
