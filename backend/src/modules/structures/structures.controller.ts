import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Audited } from '../../common/decorators/audited.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ManagerPermission, UserRole } from '../../generated/prisma/enums';
import {
  PropertyScopedBy,
  RequirePropertyPermissions,
} from '../../common/decorators/require-property-permissions.decorator';
import type { AuthenticatedUser } from '../../common/types/auth.types';
import { StructuresService, type BuildingView } from './structures.service';
import {
  CreateBuildingDto,
  CreateFloorDto,
  UpdateBuildingDto,
  UpdateFloorDto,
} from './dto/structures.dto';

const PROPERTY_ROLES = [UserRole.OWNER, UserRole.PROPERTY_MANAGER] as const;

@ApiTags('structures')
@ApiBearerAuth()
@Controller()
export class StructuresController {
  constructor(private readonly structuresService: StructuresService) {}

  @Get('properties/:propertyId/buildings')
  @Roles(...PROPERTY_ROLES)
  @ApiOperation({ summary: 'List buildings of a property with their floors' })
  listBuildings(
    @CurrentUser() user: AuthenticatedUser,
    @Param('propertyId', ParseUUIDPipe) propertyId: string,
  ): Promise<BuildingView[]> {
    return this.structuresService.listBuildings(user, propertyId);
  }

  @Post('properties/:propertyId/buildings')
  @Roles(...PROPERTY_ROLES)
  @RequirePropertyPermissions(ManagerPermission.MANAGE_ROOMS)
  @Audited({ action: 'building.created', resourceType: 'building', resourceIdFromResult: 'id' })
  @ApiOperation({ summary: 'Add a building to a property' })
  createBuilding(
    @CurrentUser() user: AuthenticatedUser,
    @Param('propertyId', ParseUUIDPipe) propertyId: string,
    @Body() dto: CreateBuildingDto,
  ): Promise<BuildingView> {
    return this.structuresService.createBuilding(user, propertyId, dto);
  }

  @Get('buildings/:id')
  @Roles(...PROPERTY_ROLES)
  @ApiOperation({ summary: 'Building detail' })
  findBuilding(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<BuildingView> {
    return this.structuresService.getBuilding(user, id);
  }

  @Patch('buildings/:id')
  @Roles(...PROPERTY_ROLES)
  @PropertyScopedBy('building')
  @RequirePropertyPermissions(ManagerPermission.MANAGE_ROOMS)
  @Audited({ action: 'building.updated', resourceType: 'building' })
  @ApiOperation({ summary: 'Rename a building' })
  updateBuilding(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBuildingDto,
  ): Promise<BuildingView> {
    return this.structuresService.updateBuilding(user, id, dto);
  }

  @Delete('buildings/:id')
  @Roles(...PROPERTY_ROLES)
  @PropertyScopedBy('building')
  @RequirePropertyPermissions(ManagerPermission.MANAGE_ROOMS)
  @Audited({ action: 'building.archived', resourceType: 'building' })
  @ApiOperation({ summary: 'Archive a building' })
  archiveBuilding(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<BuildingView> {
    return this.structuresService.archiveBuilding(user, id);
  }

  @Post('buildings/:id/floors')
  @Roles(...PROPERTY_ROLES)
  @PropertyScopedBy('building')
  @RequirePropertyPermissions(ManagerPermission.MANAGE_ROOMS)
  @Audited({ action: 'floor.created', resourceType: 'floor', resourceIdFromResult: 'id' })
  @ApiOperation({ summary: 'Add a floor to a building' })
  createFloor(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateFloorDto,
  ) {
    return this.structuresService.createFloor(user, id, dto);
  }

  @Patch('floors/:id')
  @Roles(...PROPERTY_ROLES)
  @PropertyScopedBy('floor')
  @RequirePropertyPermissions(ManagerPermission.MANAGE_ROOMS)
  @Audited({ action: 'floor.updated', resourceType: 'floor' })
  @ApiOperation({ summary: 'Update a floor' })
  updateFloor(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateFloorDto,
  ) {
    return this.structuresService.updateFloor(user, id, dto);
  }

  @Delete('floors/:id')
  @Roles(...PROPERTY_ROLES)
  @HttpCode(HttpStatus.NO_CONTENT)
  @PropertyScopedBy('floor')
  @RequirePropertyPermissions(ManagerPermission.MANAGE_ROOMS)
  @Audited({ action: 'floor.archived', resourceType: 'floor' })
  @ApiOperation({ summary: 'Archive a floor' })
  archiveFloor(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.structuresService.archiveFloor(user, id);
  }
}
