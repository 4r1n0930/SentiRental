import {
  IsEnum,
  IsISO31661Alpha2,
  IsISO4217CurrencyCode,
  IsOptional,
  IsString,
  IsTimeZone,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PropertyStatus, PropertyType } from '../../../generated/prisma/enums';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';

export class CreatePropertyDto {
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  code!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name!: string;

  @IsEnum(PropertyType)
  type!: PropertyType;

  @IsString()
  @MaxLength(255)
  addressLine1!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  addressLine2?: string;

  @IsString()
  @MaxLength(120)
  city!: string;

  @IsString()
  @MaxLength(120)
  state!: string;

  @IsString()
  @MaxLength(24)
  postalCode!: string;

  @IsOptional()
  @IsISO31661Alpha2()
  countryCode?: string;

  @IsOptional()
  @IsTimeZone()
  timeZone?: string;

  @IsOptional()
  @IsISO4217CurrencyCode()
  currency?: string;
}

export class UpdatePropertyDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsEnum(PropertyType)
  type?: PropertyType;

  @IsOptional()
  @IsEnum(PropertyStatus)
  status?: PropertyStatus;

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
  @IsTimeZone()
  timeZone?: string;

  @IsOptional()
  @IsISO4217CurrencyCode()
  currency?: string;
}

export class PropertySummaryQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(PropertyStatus)
  status?: PropertyStatus;

  @IsOptional()
  @IsEnum(PropertyType)
  type?: PropertyType;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string;
}
