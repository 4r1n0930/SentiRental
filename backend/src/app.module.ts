import { MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import configuration from './config/configuration';
import { AppConfigModule } from './config/config.module';
import { PrismaModule } from './infrastructure/prisma/prisma.module';
import { MailModule } from './infrastructure/mail/mail.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { TenantsModule } from './modules/tenants/tenants.module';
import { PropertiesModule } from './modules/properties/properties.module';
import { StructuresModule } from './modules/structures/structures.module';
import { RoomsModule } from './modules/rooms/rooms.module';
import { AmenitiesModule } from './modules/amenities/amenities.module';
import { AgreementsModule } from './modules/agreements/agreements.module';
import { ManagerAccessModule } from './modules/manager-access/manager-access.module';
import { AuditModule } from './modules/audit/audit.module';
import { HealthModule } from './modules/health/health.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { PropertyPermissionsGuard } from './common/guards/property-permissions.guard';
import { AuditInterceptor } from './common/interceptors/audit.interceptor';
import { RequestContextInterceptor } from './common/interceptors/request-context.interceptor';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { RequestContextMiddleware } from './common/middleware/request-context.middleware';

@Module({
  imports: [
    AppConfigModule,
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: ['.env.local', '.env'],
      load: [configuration],
    }),
    ThrottlerModule.forRoot([
      {
        ttl: Number(process.env.RATE_LIMIT_TTL_MS ?? 60_000),
        limit: Number(process.env.RATE_LIMIT_MAX ?? 100),
      },
    ]),
    PrismaModule,
    MailModule,
    AuthModule,
    UsersModule,
    TenantsModule,
    PropertiesModule,
    StructuresModule,
    RoomsModule,
    AmenitiesModule,
    AgreementsModule,
    ManagerAccessModule,
    AuditModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: RequestContextInterceptor },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: PropertyPermissionsGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestContextMiddleware).forRoutes('*path');
  }
}
