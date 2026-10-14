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
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Audited } from '../../common/decorators/audited.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../generated/prisma/enums';
import type { AuthenticatedUser } from '../../common/types/auth.types';
import type { Paginated } from '../../common/dto/pagination.dto';
import { UsersService, type UserView } from './users.service';
import {
  ChangeEmailDto,
  ChangePasswordDto,
  SearchUsersQueryDto,
  UpdateProfileDto,
  UpdateUserRoleDto,
  UpdateUserStatusDto,
} from './dto/users.dto';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: 'Profile of the signed-in user' })
  me(@CurrentUser() user: AuthenticatedUser): Promise<UserView> {
    return this.usersService.findMe(user.id);
  }

  @Patch('me')
  @Audited({ action: 'user.profile.updated', resourceType: 'user', resourceIdFromResult: 'id' })
  @ApiOperation({ summary: 'Update own profile' })
  updateMe(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateProfileDto,
  ): Promise<UserView> {
    return this.usersService.updateProfile(user.id, dto);
  }

  @Post('me/email')
  @Audited({
    action: 'user.email.change_requested',
    resourceType: 'user',
    resourceIdFromResult: 'id',
  })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request an email change (re-verification required)' })
  changeEmail(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ChangeEmailDto,
  ): Promise<UserView> {
    return this.usersService.changeEmail(user, dto);
  }

  @Post('me/password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Change password and revoke all sessions' })
  changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ChangePasswordDto,
  ): Promise<{ message: string }> {
    return this.usersService.changePassword(user.id, dto);
  }

  @Get('me/sessions')
  @ApiOperation({ summary: 'List refresh sessions of the signed-in user' })
  listSessions(@CurrentUser() user: AuthenticatedUser) {
    return this.usersService.listSessions(user.id);
  }

  @Delete('me/sessions/:sessionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke one refresh session' })
  revokeSession(
    @CurrentUser() user: AuthenticatedUser,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
  ): Promise<void> {
    return this.usersService.revokeSession(user.id, sessionId);
  }

  @Get()
  @Roles(UserRole.OWNER)
  @ApiOperation({ summary: 'Search users (owners only)' })
  search(@Query() query: SearchUsersQueryDto): Promise<Paginated<UserView>> {
    return this.usersService.search(query);
  }

  @Get(':id')
  @Roles(UserRole.OWNER)
  @ApiOperation({ summary: 'Fetch any user by id (owners only)' })
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<UserView> {
    return this.usersService.findById(id);
  }

  @Patch(':id/status')
  @Roles(UserRole.OWNER)
  @Audited({ action: 'user.status.changed', resourceType: 'user' })
  @ApiOperation({ summary: 'Suspend, disable or activate a user' })
  setStatus(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserStatusDto,
  ): Promise<UserView> {
    return this.usersService.setStatus(actor.id, id, dto);
  }

  @Patch(':id/role')
  @Roles(UserRole.OWNER)
  @Audited({ action: 'user.role.changed', resourceType: 'user' })
  @ApiOperation({ summary: 'Change a user role' })
  setRole(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserRoleDto,
  ): Promise<UserView> {
    return this.usersService.setRole(actor.id, id, dto);
  }
}
