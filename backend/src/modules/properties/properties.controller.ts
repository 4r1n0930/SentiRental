import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Audited } from '../../common/decorators/audited.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../generated/prisma/enums';
import type { AuthenticatedUser } from '../../common/types/auth.types';
import type { Paginated } from '../../common/dto/pagination.dto';
import { PropertiesService, type PropertyView } from './properties.service';
import {
  CreatePropertyDto,
  PropertySummaryQueryDto,
  UpdatePropertyDto,
} from './dto/properties.dto';

@ApiTags('properties')
@ApiBearerAuth()
@Controller('properties')
export class PropertiesController {
  constructor(private readonly propertiesService: PropertiesService) {}

  @Post()
  @Roles(UserRole.OWNER)
  @Audited({ action: 'property.created', resourceType: 'property', resourceIdFromResult: 'id' })
  @ApiOperation({ summary: 'Create a property (owners only)' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreatePropertyDto,
  ): Promise<PropertyView> {
    return this.propertiesService.create(user, dto);
  }

  @Get()
  @Roles(UserRole.OWNER, UserRole.PROPERTY_MANAGER)
  @ApiOperation({ summary: 'List accessible properties' })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: PropertySummaryQueryDto,
  ): Promise<Paginated<PropertyView>> {
    return this.propertiesService.list(user, query);
  }

  @Get(':id')
  @Roles(UserRole.OWNER, UserRole.PROPERTY_MANAGER)
  @ApiOperation({ summary: 'Property detail with buildings and manager assignments' })
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<PropertyView> {
    return this.propertiesService.findById(user, id);
  }

  @Patch(':id')
  @Roles(UserRole.OWNER, UserRole.PROPERTY_MANAGER)
  @Audited({ action: 'property.updated', resourceType: 'property' })
  @ApiOperation({ summary: 'Update a property' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePropertyDto,
  ): Promise<PropertyView> {
    return this.propertiesService.update(user, id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.OWNER)
  @Audited({ action: 'property.archived', resourceType: 'property' })
  @ApiOperation({ summary: 'Archive a property' })
  archive(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<PropertyView> {
    return this.propertiesService.archive(user, id);
  }

  @Get(':id/dashboard')
  @Roles(UserRole.OWNER, UserRole.PROPERTY_MANAGER)
  @ApiOperation({ summary: 'Occupancy and agreement counters for a property' })
  dashboard(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.propertiesService.dashboard(user, id);
  }
}
