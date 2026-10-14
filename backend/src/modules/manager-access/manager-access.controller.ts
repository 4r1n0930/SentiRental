import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Audited } from '../../common/decorators/audited.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../generated/prisma/enums';
import type { AuthenticatedUser } from '../../common/types/auth.types';
import { ManagerAccessService, type AssignmentView } from './manager-access.service';
import {
  BulkAssignDto,
  CreateAssignmentDto,
  UpdateAssignmentPermissionsDto,
} from './dto/manager-access.dto';

@ApiTags('manager-access')
@ApiBearerAuth()
@Controller()
export class ManagerAccessController {
  constructor(private readonly managerAccessService: ManagerAccessService) {}

  @Get('properties/:propertyId/managers')
  @Roles(UserRole.OWNER, UserRole.PROPERTY_MANAGER)
  @ApiOperation({ summary: 'List active manager assignments of a property' })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('propertyId', ParseUUIDPipe) propertyId: string,
  ): Promise<AssignmentView[]> {
    return this.managerAccessService.listForProperty(user, propertyId);
  }

  @Post('properties/:propertyId/managers')
  @Roles(UserRole.OWNER)
  @Audited({
    action: 'manager.assigned',
    resourceType: 'property_manager_assignment',
    resourceIdFromResult: 'id',
  })
  @ApiOperation({ summary: 'Assign a property manager with explicit permissions' })
  assign(
    @CurrentUser() user: AuthenticatedUser,
    @Param('propertyId', ParseUUIDPipe) propertyId: string,
    @Body() dto: CreateAssignmentDto,
  ) {
    return this.managerAccessService.assign(user, propertyId, dto);
  }

  @Post('properties/:propertyId/managers/bulk')
  @Roles(UserRole.OWNER)
  @Audited({ action: 'manager.bulk_assigned', resourceType: 'property_manager_assignment' })
  @ApiOperation({ summary: 'Assign several managers in one call' })
  bulkAssign(
    @CurrentUser() user: AuthenticatedUser,
    @Param('propertyId', ParseUUIDPipe) propertyId: string,
    @Body() dto: BulkAssignDto,
  ) {
    return this.managerAccessService.bulkAssign(user, propertyId, dto);
  }

  @Patch('manager-assignments/:id/permissions')
  @Roles(UserRole.OWNER)
  @Audited({ action: 'manager.permissions.replaced', resourceType: 'property_manager_assignment' })
  @ApiOperation({ summary: 'Replace the permission set of an assignment' })
  replacePermissions(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAssignmentPermissionsDto,
  ): Promise<AssignmentView> {
    return this.managerAccessService.replacePermissions(user, id, dto);
  }

  @Delete('manager-assignments/:id')
  @Roles(UserRole.OWNER)
  @Audited({ action: 'manager.revoked', resourceType: 'property_manager_assignment' })
  @ApiOperation({ summary: 'Revoke a manager assignment' })
  revoke(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AssignmentView> {
    return this.managerAccessService.revoke(user, id);
  }

  @Get('managers/me')
  @Roles(UserRole.PROPERTY_MANAGER)
  @ApiOperation({ summary: 'Properties and permissions granted to the signed-in manager' })
  myAccess(@CurrentUser() user: AuthenticatedUser) {
    return this.managerAccessService.myAccess(user);
  }

  @Get('managers/permissions')
  @Roles(UserRole.OWNER, UserRole.PROPERTY_MANAGER)
  @ApiOperation({ summary: 'Permission catalog available for assignment' })
  availablePermissions() {
    return this.managerAccessService.availablePermissions();
  }
}
