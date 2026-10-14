import { Global, Module } from '@nestjs/common';
import { APP_CONFIG, APP_CONFIG_PROVIDER } from './app-config';

/**
 * Holds the validated, typed configuration tree. Global so infrastructure modules
 * (Prisma, mail, auth) can inject `APP_CONFIG` without re-importing.
 */
@Global()
@Module({
  providers: [APP_CONFIG_PROVIDER],
  exports: [APP_CONFIG],
})
export class AppConfigModule {}
