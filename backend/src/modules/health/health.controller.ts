import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { APP_CONFIG, type AppConfig } from '../../config/app-config';
import { Inject } from '@nestjs/common';

interface CheckResult {
  status: 'up' | 'down';
  latencyMs?: number;
  message?: string;
}

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Liveness probe' })
  live() {
    return {
      status: 'ok',
      service: 'senti-rental-api',
      environment: this.config.app.env,
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }

  @Public()
  @Get('ready')
  @ApiOperation({ summary: 'Readiness probe including the database connection' })
  async ready(): Promise<{ status: string; checks: Record<string, CheckResult> }> {
    const startedAt = Date.now();
    const database = await this.checkDatabase(startedAt);
    const status = database.status === 'up' ? 'ok' : 'degraded';

    return { status, checks: { database } };
  }

  private async checkDatabase(startedAt: number): Promise<CheckResult> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'up', latencyMs: Date.now() - startedAt };
    } catch (error) {
      return {
        status: 'down',
        message: error instanceof Error ? error.message : 'database unreachable',
      };
    }
  }
}
