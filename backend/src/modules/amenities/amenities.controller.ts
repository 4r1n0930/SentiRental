import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Audited } from '../../common/decorators/audited.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../generated/prisma/enums';
import type { Paginated } from '../../common/dto/pagination.dto';
import { AmenitiesService, type AmenityView } from './amenities.service';
import { CreateAmenityDto, ListAmenitiesQueryDto, UpdateAmenityDto } from './dto/amenities.dto';

@ApiTags('amenities')
@ApiBearerAuth()
@Controller('amenities')
export class AmenitiesController {
  constructor(private readonly amenitiesService: AmenitiesService) {}

  @Get()
  @ApiOperation({ summary: 'List the amenity catalog' })
  list(@Query() query: ListAmenitiesQueryDto): Promise<Paginated<AmenityView>> {
    return this.amenitiesService.list(query);
  }

  @Post()
  @Roles(UserRole.OWNER)
  @Audited({ action: 'amenity.created', resourceType: 'amenity', resourceIdFromResult: 'id' })
  @ApiOperation({ summary: 'Create an amenity (owners only)' })
  create(@Body() dto: CreateAmenityDto): Promise<AmenityView> {
    return this.amenitiesService.create(dto);
  }

  @Patch(':id')
  @Roles(UserRole.OWNER)
  @Audited({ action: 'amenity.updated', resourceType: 'amenity' })
  @ApiOperation({ summary: 'Update or deactivate an amenity' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAmenityDto,
  ): Promise<AmenityView> {
    return this.amenitiesService.update(id, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Fetch a single amenity' })
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<AmenityView> {
    return this.amenitiesService.findById(id);
  }
}
