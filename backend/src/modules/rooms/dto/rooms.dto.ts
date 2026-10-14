import {
  IsArray,
  IsEnum,
  IsInt,
  IsISO4217CurrencyCode,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { RoomOperationalStatus, RoomType } from '../../../generated/prisma/enums';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';

export class CreateRoomDto {
  @IsUUID()
  floorId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(50)
  number!: string;

  @IsEnum(RoomType)
  type!: RoomType;

  @IsInt()
  @Min(1)
  capacity!: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  baseRentAmount?: number;

  @IsOptional()
  @IsISO4217CurrencyCode()
  currency?: string;

  @IsOptional()
  @IsArray()
  amenityIds?: string[];
}

export class UpdateRoomDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  number?: string;

  @IsOptional()
  @IsEnum(RoomType)
  type?: RoomType;

  @IsOptional()
  @IsInt()
  @Min(1)
  capacity?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  baseRentAmount?: number;

  @IsOptional()
  @IsEnum(RoomOperationalStatus)
  operationalStatus?: RoomOperationalStatus;
}

export class SetRoomStatusDto {
  @IsEnum(RoomOperationalStatus)
  status!: RoomOperationalStatus;
}

export class SetRoomAmenitiesDto {
  @IsArray()
  amenityIds!: string[];
}

export class ListRoomsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID()
  floorId?: string;

  @IsOptional()
  @IsEnum(RoomOperationalStatus)
  operationalStatus?: RoomOperationalStatus;

  @IsOptional()
  @IsEnum(RoomType)
  type?: RoomType;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  search?: string;
}
