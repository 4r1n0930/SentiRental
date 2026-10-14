import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AgreementStatus, TenantStatus, UserRole } from '../../generated/prisma/enums';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { paginate, resolvePagination, type Paginated } from '../../common/dto/pagination.dto';
import {
  assertPropertyAccess,
  asNestedWhere,
  scopePropertiesForActor,
} from '../../common/services/property-scope.service';
import type { AuthenticatedUser } from '../../common/types/auth.types';
import type {
  ActivateAgreementDto,
  CreateAgreementDto,
  ListAgreementsQueryDto,
  TerminateAgreementDto,
  UpdateAgreementDto,
} from './dto/agreements.dto';

const AGREEMENT_INCLUDE = {
  room: {
    select: {
      id: true,
      number: true,
      type: true,
      floor: {
        select: {
          id: true,
          code: true,
          name: true,
          building: { select: { id: true, name: true, propertyId: true } },
        },
      },
    },
  },
  tenants: {
    include: {
      tenant: {
        select: {
          id: true,
          status: true,
          kycStatus: true,
          user: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
        },
      },
    },
  },
  createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
} satisfies Prisma.RentalAgreementInclude;

export type AgreementView = Prisma.RentalAgreementGetPayload<{ include: typeof AGREEMENT_INCLUDE }>;

const EXPIRING_WINDOW_DAYS = 45;

@Injectable()
export class AgreementsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(actor: AuthenticatedUser, dto: CreateAgreementDto): Promise<AgreementView> {
    const start = new Date(dto.startDate);
    const end = new Date(dto.endDate);

    if (end.getTime() <= start.getTime()) {
      throw new BadRequestException('endDate must be after startDate');
    }

    const room = await this.prisma.room.findUnique({
      where: { id: dto.roomId },
      select: {
        id: true,
        archivedAt: true,
        operationalStatus: true,
        currency: true,
        floor: { select: { building: { select: { propertyId: true } } } },
      },
    });

    if (!room) {
      throw new NotFoundException('Room not found');
    }

    await this.assertScope(actor, room.floor.building.propertyId);

    if (room.archivedAt) {
      throw new ConflictException('Cannot create an agreement for an archived room');
    }

    const overlap = await this.prisma.rentalAgreement.findFirst({
      where: {
        roomId: dto.roomId,
        status: { in: [AgreementStatus.DRAFT, AgreementStatus.ACTIVE, AgreementStatus.EXPIRING] },
        startDate: { lte: end },
        endDate: { gte: start },
      },
      select: { id: true },
    });

    if (overlap) {
      throw new ConflictException('The room already has an agreement overlapping these dates');
    }

    if (dto.tenants.length > 0) {
      const primaryCount = dto.tenants.filter((tenant) => tenant.isPrimary).length;
      if (primaryCount !== 1) {
        throw new BadRequestException('Exactly one tenant must be flagged as primary');
      }

      const tenantCount = await this.prisma.tenant.count({
        where: { id: { in: dto.tenants.map((tenant) => tenant.tenantId) } },
      });

      if (tenantCount !== new Set(dto.tenants.map((tenant) => tenant.tenantId)).size) {
        throw new NotFoundException('One or more tenants do not exist');
      }
    }

    const agreement = await this.prisma.rentalAgreement.create({
      data: {
        roomId: dto.roomId,
        createdById: actor.id,
        startDate: start,
        endDate: end,
        monthlyRentAmount: new Prisma.Decimal(dto.monthlyRentAmount),
        securityDepositAmount: new Prisma.Decimal(dto.securityDepositAmount),
        currency: (dto.currency ?? room.currency).toUpperCase(),
        noticePeriodDays: dto.noticePeriodDays ?? 30,
        status: AgreementStatus.DRAFT,
        tenants: {
          create: dto.tenants.map((tenant) => ({
            tenantId: tenant.tenantId,
            isPrimary: tenant.isPrimary ?? false,
            startDate: new Date(tenant.startDate),
            endDate: new Date(tenant.endDate),
          })),
        },
      },
    });

    return this.findById(actor, agreement.id);
  }

  async list(
    actor: AuthenticatedUser,
    query: ListAgreementsQueryDto,
  ): Promise<Paginated<AgreementView>> {
    const { page, perPage, skip, sortOrder } = resolvePagination(query);

    const propertyScope = scopePropertiesForActor(actor, {});

    const where: Prisma.RentalAgreementWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.roomId ? { roomId: query.roomId } : {}),
      ...(query.endingBefore ? { endDate: { lte: new Date(query.endingBefore) } } : {}),
      ...(actor.role === UserRole.TENANT && actor.tenantId
        ? { tenants: { some: { tenantId: actor.tenantId } } }
        : {}),
      ...(actor.role !== UserRole.TENANT
        ? {
            room: {
              is: {
                floor: {
                  is: { building: { is: asNestedWhere<Prisma.BuildingWhereInput>(propertyScope) } },
                },
              },
            },
          }
        : {}),
      ...(query.tenantId ? { tenants: { some: { tenantId: query.tenantId } } } : {}),
    };

    const [total, items] = await Promise.all([
      this.prisma.rentalAgreement.count({ where }),
      this.prisma.rentalAgreement.findMany({
        where,
        include: AGREEMENT_INCLUDE,
        orderBy: { createdAt: sortOrder },
        skip,
        take: perPage,
      }),
    ]);

    return paginate(Promise.resolve(total), Promise.resolve(items), page, perPage);
  }

  async findById(actor: AuthenticatedUser, id: string): Promise<AgreementView> {
    const agreement = await this.prisma.rentalAgreement.findUnique({
      where: { id },
      include: AGREEMENT_INCLUDE,
    });

    if (!agreement) {
      throw new NotFoundException('Agreement not found');
    }

    const propertyId = agreement.room.floor.building.propertyId;
    await this.assertScope(actor, propertyId);

    if (actor.role === UserRole.TENANT) {
      const linked = agreement.tenants.some((item) => item.tenantId === actor.tenantId);
      if (!linked) {
        throw new ForbiddenException('This agreement is not linked to your tenant profile');
      }
    }

    return agreement;
  }

  async update(
    actor: AuthenticatedUser,
    id: string,
    dto: UpdateAgreementDto,
  ): Promise<AgreementView> {
    const agreement = await this.findById(actor, id);

    if (agreement.status !== AgreementStatus.DRAFT && agreement.status !== AgreementStatus.ACTIVE) {
      throw new ConflictException('Only DRAFT or ACTIVE agreements can be edited');
    }

    await this.prisma.rentalAgreement.update({
      where: { id },
      data: {
        ...(dto.monthlyRentAmount !== undefined
          ? { monthlyRentAmount: new Prisma.Decimal(dto.monthlyRentAmount) }
          : {}),
        ...(dto.securityDepositAmount !== undefined
          ? { securityDepositAmount: new Prisma.Decimal(dto.securityDepositAmount) }
          : {}),
        ...(dto.noticePeriodDays !== undefined ? { noticePeriodDays: dto.noticePeriodDays } : {}),
        ...(dto.endDate !== undefined ? { endDate: new Date(dto.endDate) } : {}),
      },
    });

    return this.findById(actor, id);
  }

  async activate(
    actor: AuthenticatedUser,
    id: string,
    dto: ActivateAgreementDto,
  ): Promise<AgreementView> {
    const agreement = await this.findById(actor, id);

    if (agreement.status !== AgreementStatus.DRAFT) {
      throw new ConflictException('Only DRAFT agreements can be activated');
    }

    if (agreement.tenants.length === 0) {
      throw new BadRequestException('Attach at least one tenant before activating');
    }

    const start = dto.startDate ? new Date(dto.startDate) : agreement.startDate;

    const conflicting = await this.prisma.rentalAgreement.findFirst({
      where: {
        roomId: agreement.roomId,
        id: { not: agreement.id },
        status: { in: [AgreementStatus.ACTIVE, AgreementStatus.EXPIRING] },
      },
      select: { id: true },
    });

    if (conflicting) {
      throw new ConflictException('Another agreement is already active for this room');
    }

    await this.prisma.$transaction([
      this.prisma.rentalAgreement.update({
        where: { id },
        data: { status: AgreementStatus.ACTIVE, activatedAt: new Date(), startDate: start },
      }),
      this.prisma.tenant.updateMany({
        where: { id: { in: agreement.tenants.map((item) => item.tenantId) } },
        data: { status: TenantStatus.ACTIVE },
      }),
    ]);

    return this.findById(actor, id);
  }

  async terminate(
    actor: AuthenticatedUser,
    id: string,
    dto: TerminateAgreementDto,
  ): Promise<AgreementView> {
    const agreement = await this.findById(actor, id);

    if (
      agreement.status === AgreementStatus.TERMINATED ||
      agreement.status === AgreementStatus.EXPIRED
    ) {
      throw new ConflictException('Agreement is already closed');
    }

    await this.prisma.$transaction([
      this.prisma.rentalAgreement.update({
        where: { id },
        data: {
          status: AgreementStatus.TERMINATED,
          terminatedAt: dto.terminatedAt ? new Date(dto.terminatedAt) : new Date(),
          terminationReason: dto.reason,
        },
      }),
      this.prisma.tenant.updateMany({
        where: { id: { in: agreement.tenants.map((item) => item.tenantId) } },
        data: { status: TenantStatus.NOTICE_PERIOD },
      }),
    ]);

    return this.findById(actor, id);
  }

  async renew(
    actor: AuthenticatedUser,
    id: string,
    dto: UpdateAgreementDto,
  ): Promise<AgreementView> {
    const agreement = await this.findById(actor, id);

    if (!dto.endDate) {
      throw new BadRequestException('endDate is required to renew an agreement');
    }

    const newEnd = new Date(dto.endDate);
    if (newEnd.getTime() <= agreement.endDate.getTime()) {
      throw new BadRequestException('Renewal endDate must be later than the current endDate');
    }

    await this.prisma.$transaction([
      this.prisma.rentalAgreement.update({
        where: { id },
        data: {
          endDate: newEnd,
          status: AgreementStatus.ACTIVE,
          ...(dto.monthlyRentAmount !== undefined
            ? { monthlyRentAmount: new Prisma.Decimal(dto.monthlyRentAmount) }
            : {}),
          ...(dto.securityDepositAmount !== undefined
            ? { securityDepositAmount: new Prisma.Decimal(dto.securityDepositAmount) }
            : {}),
        },
      }),
      this.prisma.agreementTenant.updateMany({
        where: { agreementId: id },
        data: { endDate: newEnd },
      }),
    ]);

    return this.findById(actor, id);
  }

  /** Flags agreements ending soon and closes the ones already past their end date. */
  async sweepLifecycle(): Promise<{ expiring: number; expired: number }> {
    const now = new Date();
    const horizon = new Date(now.getTime() + EXPIRING_WINDOW_DAYS * 24 * 60 * 60 * 1000);

    const [expiring, expired] = await this.prisma.$transaction([
      this.prisma.rentalAgreement.updateMany({
        where: { status: AgreementStatus.ACTIVE, endDate: { gt: now, lte: horizon } },
        data: { status: AgreementStatus.EXPIRING },
      }),
      this.prisma.rentalAgreement.updateMany({
        where: {
          status: { in: [AgreementStatus.ACTIVE, AgreementStatus.EXPIRING] },
          endDate: { lt: now },
        },
        data: { status: AgreementStatus.EXPIRED },
      }),
    ]);

    return { expiring: expiring.count, expired: expired.count };
  }

  /**
   * Confirms a staff actor may act on the property that owns this agreement.
   * Tenants are let through and constrained by the party check at the call site.
   */
  private async assertScope(actor: AuthenticatedUser, propertyId: string): Promise<void> {
    if (actor.role === UserRole.TENANT) {
      return;
    }

    await assertPropertyAccess(this.prisma, actor, propertyId);
  }
}
