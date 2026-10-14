import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { getRequestContext } from '../context/request-context';
import type { RequestActor } from '../types/auth.types';

export interface AuditEntry {
  actorUserId?: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(entry: AuditEntry): Promise<void> {
    const context = getRequestContext();

    try {
      await this.prisma.auditLog.create({
        data: {
          actorUserId: entry.actorUserId ?? null,
          action: entry.action,
          resourceType: entry.resourceType,
          resourceId: entry.resourceId ?? null,
          requestId: context?.requestId ?? null,
          ipAddress:
            (entry.metadata?.ipAddress as string | undefined) ?? context?.ipAddress ?? null,
          userAgent: context?.userAgent?.slice(0, 2000) ?? null,
          metadata: (entry.metadata ?? {}) as never,
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to write audit log action=${entry.action}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  async recordForActor(actor: RequestActor, entry: Omit<AuditEntry, 'actorUserId'>): Promise<void> {
    await this.record({ ...entry, actorUserId: actor.id });
  }
}
