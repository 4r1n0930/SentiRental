import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { paginate, resolvePagination, type Paginated } from '../../common/dto/pagination.dto';
import { scopePropertiesForActor } from '../../common/services/property-scope.service';
import type { AuthenticatedUser } from '../../common/types/auth.types';
import type { AuditLogQueryDto } from './dto/audit.dto';

const AUDIT_SELECT = {
  id: true,
  actorUserId: true,
  action: true,
  resourceType: true,
  resourceId: true,
  requestId: true,
  ipAddress: true,
  metadata: true,
  occurredAt: true,
  actor: { select: { id: true, email: true, firstName: true, lastName: true } },
} satisfies Prisma.AuditLogSelect;

export type AuditLogView = Prisma.AuditLogGetPayload<{ select: typeof AUDIT_SELECT }>;

@Injectable()
export class AuditLogsService {
  constructor(private readonly prisma: PrismaService) {}

  async search(
    actor: AuthenticatedUser,
    query: AuditLogQueryDto,
  ): Promise<Paginated<AuditLogView>> {
    const { page, perPage, skip, sortOrder } = resolvePagination(query);

    const where: Prisma.AuditLogWhereInput = {
      ...(query.action ? { action: { startsWith: query.action } } : {}),
      ...(query.resourceType ? { resourceType: query.resourceType } : {}),
      ...(query.resourceId ? { resourceId: query.resourceId } : {}),
      ...(query.actorUserId ? { actorUserId: query.actorUserId } : {}),
      ...(query.from ? { occurredAt: { gte: new Date(query.from) } } : {}),
      ...(query.to ? { occurredAt: { lte: new Date(query.to) } } : {}),
      ...(await this.actorScope(actor)),
    };

    const [total, items] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        select: AUDIT_SELECT,
        orderBy: { occurredAt: sortOrder },
        skip,
        take: perPage,
      }),
    ]);

    return paginate(Promise.resolve(total), Promise.resolve(items), page, perPage);
  }

  private async actorScope(actor: AuthenticatedUser): Promise<Prisma.AuditLogWhereInput> {
    if (actor.role === 'OWNER') {
      return {};
    }

    if (actor.role === 'PROPERTY_MANAGER') {
      const propertyWhere = scopePropertiesForActor(actor, {});
      const propertyIds = (
        await this.prisma.property.findMany({ where: propertyWhere, select: { id: true } })
      ).map((property) => property.id);

      if (propertyIds.length === 0) {
        return { actorUserId: actor.id };
      }

      return {
        OR: [{ actorUserId: actor.id }, { resourceId: { in: propertyIds } }],
      };
    }

    return { actorUserId: actor.id };
  }
}
