import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Audited } from '../../common/decorators/audited.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../generated/prisma/enums';
import type { AuthenticatedUser } from '../../common/types/auth.types';
import type { Paginated } from '../../common/dto/pagination.dto';
import { TenantsService, type TenantView } from './tenants.service';
import {
  SearchTenantsQueryDto,
  UpdateKycDto,
  UpdateTenantProfileDto,
  UpdateTenantStatusDto,
} from './dto/tenants.dto';

const STAFF_ROLES = [UserRole.OWNER, UserRole.PROPERTY_MANAGER] as const;

@ApiTags('tenants')
@ApiBearerAuth()
@Controller('tenants')
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Get('me')
  @ApiOperation({ summary: 'Tenant profile of the signed-in account' })
  me(@CurrentUser() user: AuthenticatedUser): Promise<TenantView> {
    return this.tenantsService.findMe(user);
  }

  @Patch('me')
  @Roles(UserRole.TENANT)
  @Audited({ action: 'tenant.profile.updated', resourceType: 'tenant' })
  @ApiOperation({ summary: 'Update own contact and address details' })
  updateMe(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateTenantProfileDto,
  ): Promise<TenantView> {
    return this.tenantsService.updateOwnProfile(user, dto);
  }

  @Get()
  @Roles(...STAFF_ROLES)
  @ApiOperation({ summary: 'Search tenant profiles' })
  search(@Query() query: SearchTenantsQueryDto): Promise<Paginated<TenantView>> {
    return this.tenantsService.search(query);
  }

  @Get(':id')
  @Roles(...STAFF_ROLES)
  @ApiOperation({ summary: 'Fetch a tenant profile by id' })
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<TenantView> {
    return this.tenantsService.findById(id);
  }

  @Patch(':id')
  @Roles(...STAFF_ROLES)
  @Audited({ action: 'tenant.profile.updated_by_staff', resourceType: 'tenant' })
  @ApiOperation({ summary: 'Update a tenant profile as staff' })
  updateByStaff(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTenantProfileDto,
  ): Promise<TenantView> {
    return this.tenantsService.updateProfileByStaff(id, dto);
  }

  @Patch(':id/status')
  @Roles(...STAFF_ROLES)
  @Audited({ action: 'tenant.status.changed', resourceType: 'tenant' })
  @ApiOperation({ summary: 'Move a tenant through APPLICANT/ACTIVE/NOTICE_PERIOD/MOVED_OUT' })
  setStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTenantStatusDto,
  ): Promise<TenantView> {
    return this.tenantsService.setStatus(id, dto);
  }

  @Patch(':id/kyc')
  @Roles(...STAFF_ROLES)
  @Audited({ action: 'tenant.kyc.changed', resourceType: 'tenant' })
  @ApiOperation({ summary: 'Record a KYC decision' })
  setKyc(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateKycDto): Promise<TenantView> {
    return this.tenantsService.setKyc(id, dto);
  }
}
