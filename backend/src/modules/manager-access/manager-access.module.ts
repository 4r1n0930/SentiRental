import { Module } from '@nestjs/common';
import { ManagerAccessController } from './manager-access.controller';
import { ManagerAccessService } from './manager-access.service';

@Module({
  controllers: [ManagerAccessController],
  providers: [ManagerAccessService],
  exports: [ManagerAccessService],
})
export class ManagerAccessModule {}
