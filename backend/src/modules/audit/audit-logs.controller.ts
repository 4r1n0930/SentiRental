import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../generated/prisma/enums';
import type { AuthenticatedUser } from '../../common/types/auth.types';
import type { Paginated } from '../../common/dto/pagination.dto';
import { AuditLogsService, type AuditLogView } from './audit-logs.service';
import { AuditLogQueryDto } from './dto/audit.dto';

@ApiTags('audit')
@ApiBearerAuth()
@Controller('audit-logs')
export class AuditLogsController {
  constructor(private readonly auditLogsService: AuditLogsService) {}

  @Get()
  @Roles(UserRole.OWNER, UserRole.PROPERTY_MANAGER)
  @ApiOperation({ summary: 'Search the audit trail within the actor scope' })
  search(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: AuditLogQueryDto,
  ): Promise<Paginated<AuditLogView>> {
    return this.auditLogsService.search(user, query);
  }
}
