import { IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';

export class CreateBuildingDto {
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  code!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name!: string;
}

export class UpdateBuildingDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  name?: string;
}

export class CreateFloorDto {
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  code!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsInt()
  @Min(-10)
  level?: number;
}

export class UpdateFloorDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsInt()
  @Min(-10)
  level?: number;
}

export class ListRoomsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  search?: string;
}
