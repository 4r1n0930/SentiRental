import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { APP_CONFIG, type AppConfig } from '../../config/app-config';
import { PrismaClient, Prisma } from '../../generated/prisma/client';

const PrismaClientCtor = PrismaClient as unknown as new (
  options: Prisma.PrismaClientOptions,
) => PrismaClient;

@Injectable()
export class PrismaService extends PrismaClientCtor implements OnModuleInit, OnModuleDestroy {
  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    super({
      adapter: new PrismaPg({ connectionString: config.database.url }),
      log: config.app.isProduction ? ['error'] : ['warn', 'error'],
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
