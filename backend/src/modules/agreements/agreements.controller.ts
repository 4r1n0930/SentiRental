import {
  Body,
  Controller,
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
import {
  PropertyScopedBy,
  PropertyScopedByBody,
  RequireAnyPropertyPermission,
  RequirePropertyPermissions,
} from '../../common/decorators/require-property-permissions.decorator';
import { ManagerPermission, UserRole } from '../../generated/prisma/enums';
import type { AuthenticatedUser } from '../../common/types/auth.types';
import type { Paginated } from '../../common/dto/pagination.dto';
import { AgreementsService, type AgreementView } from './agreements.service';
import {
  ActivateAgreementDto,
  CreateAgreementDto,
  ListAgreementsQueryDto,
  TerminateAgreementDto,
  UpdateAgreementDto,
} from './dto/agreements.dto';

const PROPERTY_ROLES = [UserRole.OWNER, UserRole.PROPERTY_MANAGER] as const;

@ApiTags('agreements')
@ApiBearerAuth()
@Controller('agreements')
export class AgreementsController {
  constructor(private readonly agreementsService: AgreementsService) {}

  @Post()
  @Roles(...PROPERTY_ROLES)
  @PropertyScopedByBody('room', 'roomId')
  @RequirePropertyPermissions(ManagerPermission.MANAGE_AGREEMENTS)
  @Audited({
    action: 'agreement.created',
    resourceType: 'rental_agreement',
    resourceIdFromResult: 'id',
  })
  @ApiOperation({ summary: 'Draft a rental agreement for a room' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateAgreementDto,
  ): Promise<AgreementView> {
    return this.agreementsService.create(user, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List agreements visible to the actor' })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListAgreementsQueryDto,
  ): Promise<Paginated<AgreementView>> {
    return this.agreementsService.list(user, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Agreement detail with room and tenants' })
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AgreementView> {
    return this.agreementsService.findById(user, id);
  }

  @Patch(':id')
  @Roles(...PROPERTY_ROLES)
  @PropertyScopedBy('agreement')
  @RequirePropertyPermissions(ManagerPermission.MANAGE_AGREEMENTS)
  @Audited({ action: 'agreement.updated', resourceType: 'rental_agreement' })
  @ApiOperation({ summary: 'Edit rent, deposit, notice period or end date' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAgreementDto,
  ): Promise<AgreementView> {
    return this.agreementsService.update(user, id, dto);
  }

  @Post(':id/activate')
  @Roles(...PROPERTY_ROLES)
  @PropertyScopedBy('agreement')
  @RequirePropertyPermissions(ManagerPermission.MANAGE_AGREEMENTS)
  @Audited({ action: 'agreement.activated', resourceType: 'rental_agreement' })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Activate a DRAFT agreement and mark tenants ACTIVE' })
  activate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ActivateAgreementDto,
  ): Promise<AgreementView> {
    return this.agreementsService.activate(user, id, dto);
  }

  @Post(':id/terminate')
  @Roles(...PROPERTY_ROLES)
  @PropertyScopedBy('agreement')
  @RequirePropertyPermissions(ManagerPermission.MANAGE_AGREEMENTS)
  @Audited({ action: 'agreement.terminated', resourceType: 'rental_agreement' })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Terminate an agreement and move tenants to NOTICE_PERIOD' })
  terminate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TerminateAgreementDto,
  ): Promise<AgreementView> {
    return this.agreementsService.terminate(user, id, dto);
  }

  @Post(':id/renew')
  @Roles(...PROPERTY_ROLES)
  @PropertyScopedBy('agreement')
  @RequireAnyPropertyPermission(ManagerPermission.MANAGE_AGREEMENTS, ManagerPermission.MANAGE_RENT)
  @Audited({ action: 'agreement.renewed', resourceType: 'rental_agreement' })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Extend an agreement end date (optionally re-pricing rent)' })
  renew(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAgreementDto,
  ): Promise<AgreementView> {
    return this.agreementsService.renew(user, id, dto);
  }
}
