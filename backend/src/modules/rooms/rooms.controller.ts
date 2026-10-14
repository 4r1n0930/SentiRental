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
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Audited } from '../../common/decorators/audited.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import {
  PropertyScopedBy,
  RequirePropertyPermissions,
} from '../../common/decorators/require-property-permissions.decorator';
import { ManagerPermission, UserRole } from '../../generated/prisma/enums';
import type { AuthenticatedUser } from '../../common/types/auth.types';
import type { Paginated } from '../../common/dto/pagination.dto';
import { RoomsService, type RoomView } from './rooms.service';
import {
  CreateRoomDto,
  ListRoomsQueryDto,
  SetRoomAmenitiesDto,
  SetRoomStatusDto,
  UpdateRoomDto,
} from './dto/rooms.dto';

const PROPERTY_ROLES = [UserRole.OWNER, UserRole.PROPERTY_MANAGER] as const;

@ApiTags('rooms')
@ApiBearerAuth()
@Controller('rooms')
export class RoomsController {
  constructor(private readonly roomsService: RoomsService) {}

  @Post()
  @Roles(...PROPERTY_ROLES)
  @ApiOperation({ summary: 'Add a room to a floor' })
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateRoomDto): Promise<RoomView> {
    return this.roomsService.create(user, dto);
  }

  @Get()
  @Roles(...PROPERTY_ROLES)
  @ApiOperation({ summary: 'List rooms across properties the actor can see' })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListRoomsQueryDto,
  ): Promise<Paginated<RoomView>> {
    return this.roomsService.list(user, query);
  }

  @Get(':id')
  @Roles(...PROPERTY_ROLES)
  @ApiOperation({ summary: 'Room detail with amenities and latest agreement' })
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<RoomView> {
    return this.roomsService.findById(user, id);
  }

  @Patch(':id')
  @Roles(...PROPERTY_ROLES)
  @PropertyScopedBy('room')
  @RequirePropertyPermissions(ManagerPermission.MANAGE_ROOMS)
  @Audited({ action: 'room.updated', resourceType: 'room' })
  @ApiOperation({ summary: 'Update room details' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRoomDto,
  ): Promise<RoomView> {
    return this.roomsService.update(user, id, dto);
  }

  @Put(':id/status')
  @Roles(...PROPERTY_ROLES)
  @PropertyScopedBy('room')
  @RequirePropertyPermissions(ManagerPermission.MANAGE_ROOMS)
  @Audited({ action: 'room.status.changed', resourceType: 'room' })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Set ACTIVE / MAINTENANCE / INACTIVE' })
  setStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetRoomStatusDto,
  ): Promise<RoomView> {
    return this.roomsService.setOperationalStatus(user, id, dto.status);
  }

  @Put(':id/amenities')
  @Roles(...PROPERTY_ROLES)
  @PropertyScopedBy('room')
  @RequirePropertyPermissions(ManagerPermission.MANAGE_ROOMS, ManagerPermission.MANAGE_INVENTORY)
  @Audited({ action: 'room.amenities.replaced', resourceType: 'room' })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Replace the amenity set of a room' })
  setAmenities(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetRoomAmenitiesDto,
  ): Promise<RoomView> {
    return this.roomsService.setAmenities(user, id, dto);
  }

  @Delete(':id')
  @Roles(...PROPERTY_ROLES)
  @PropertyScopedBy('room')
  @RequirePropertyPermissions(ManagerPermission.MANAGE_ROOMS)
  @Audited({ action: 'room.archived', resourceType: 'room' })
  @ApiOperation({ summary: 'Archive a room (blocked while an agreement is active)' })
  archive(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<RoomView> {
    return this.roomsService.archive(user, id);
  }
}
