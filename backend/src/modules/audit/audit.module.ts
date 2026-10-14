import { Global, Module } from '@nestjs/common';
import { AuditService } from '../../common/services/audit.service';
import { AuditLogsController } from './audit-logs.controller';
import { AuditLogsService } from './audit-logs.service';

@Global()
@Module({
  controllers: [AuditLogsController],
  providers: [AuditService, AuditLogsService],
  exports: [AuditService, AuditLogsService],
})
export class AuditModule {}
