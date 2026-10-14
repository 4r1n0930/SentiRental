import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PropertyStatus, UserRole } from '../../generated/prisma/enums';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { paginate, resolvePagination, type Paginated } from '../../common/dto/pagination.dto';
import {
  assertPropertyAccess,
  scopePropertiesForActor,
} from '../../common/services/property-scope.service';
import type { AuthenticatedUser } from '../../common/types/auth.types';
import type {
  CreatePropertyDto,
  PropertySummaryQueryDto,
  UpdatePropertyDto,
} from './dto/properties.dto';

const PROPERTY_INCLUDE = {
  buildings: { select: { id: true, code: true, name: true, archivedAt: true } },
  managerAssignments: {
    where: { revokedAt: null },
    select: {
      id: true,
      startDate: true,
      endDate: true,
      managerUser: { select: { id: true, firstName: true, lastName: true, email: true } },
      permissions: { select: { permission: true } },
    },
  },
  owner: { select: { id: true, firstName: true, lastName: true, email: true } },
} satisfies Prisma.PropertyInclude;

export type PropertyView = Prisma.PropertyGetPayload<{ include: typeof PROPERTY_INCLUDE }>;

@Injectable()
export class PropertiesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(actor: AuthenticatedUser, dto: CreatePropertyDto): Promise<PropertyView> {
    if (actor.role !== UserRole.OWNER) {
      throw new ForbiddenException('Only owners can create properties');
    }

    const property = await this.prisma.property.create({
      data: {
        ownerId: actor.id,
        createdById: actor.id,
        code: dto.code.trim().toUpperCase(),
        name: dto.name.trim(),
        type: dto.type,
        addressLine1: dto.addressLine1.trim(),
        addressLine2: dto.addressLine2?.trim() ?? null,
        city: dto.city.trim(),
        state: dto.state.trim(),
        postalCode: dto.postalCode.trim(),
        countryCode: (dto.countryCode ?? 'IN').toUpperCase(),
        timeZone: dto.timeZone ?? 'Asia/Kolkata',
        currency: (dto.currency ?? 'INR').toUpperCase(),
      },
    });

    return this.findById(actor, property.id);
  }

  async list(
    actor: AuthenticatedUser,
    query: PropertySummaryQueryDto,
  ): Promise<Paginated<PropertyView>> {
    const { page, perPage, skip, sortOrder } = resolvePagination(query);

    const where = scopePropertiesForActor(actor, {
      ...(query.status ? { status: query.status } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.city ? { city: { contains: query.city, mode: 'insensitive' } } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { code: { contains: query.search, mode: 'insensitive' } },
              { city: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    });

    const [total, items] = await Promise.all([
      this.prisma.property.count({ where }),
      this.prisma.property.findMany({
        where,
        include: PROPERTY_INCLUDE,
        orderBy: { createdAt: sortOrder },
        skip,
        take: perPage,
      }),
    ]);

    return paginate(Promise.resolve(total), Promise.resolve(items), page, perPage);
  }

  async findById(actor: AuthenticatedUser, id: string): Promise<PropertyView> {
    await assertPropertyAccess(this.prisma, actor, id);

    const property = await this.prisma.property.findUnique({
      where: { id },
      include: PROPERTY_INCLUDE,
    });

    if (!property) {
      throw new NotFoundException('Property not found');
    }

    return property;
  }

  async update(
    actor: AuthenticatedUser,
    id: string,
    dto: UpdatePropertyDto,
  ): Promise<PropertyView> {
    await assertPropertyAccess(this.prisma, actor, id);

    await this.prisma.property.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.type !== undefined ? { type: dto.type } : {}),
        ...(dto.status !== undefined
          ? {
              status: dto.status,
              archivedAt: dto.status === PropertyStatus.ARCHIVED ? new Date() : null,
            }
          : {}),
        ...(dto.addressLine1 !== undefined ? { addressLine1: dto.addressLine1.trim() } : {}),
        ...(dto.addressLine2 !== undefined
          ? { addressLine2: dto.addressLine2?.trim() || null }
          : {}),
        ...(dto.city !== undefined ? { city: dto.city.trim() } : {}),
        ...(dto.state !== undefined ? { state: dto.state.trim() } : {}),
        ...(dto.postalCode !== undefined ? { postalCode: dto.postalCode.trim() } : {}),
        ...(dto.timeZone !== undefined ? { timeZone: dto.timeZone } : {}),
        ...(dto.currency !== undefined ? { currency: dto.currency.toUpperCase() } : {}),
      },
    });

    return this.findById(actor, id);
  }

  async archive(actor: AuthenticatedUser, id: string): Promise<PropertyView> {
    return this.update(actor, id, { status: PropertyStatus.ARCHIVED });
  }

  async dashboard(actor: AuthenticatedUser, id: string) {
    await assertPropertyAccess(this.prisma, actor, id);

    const [rooms, agreements, occupancy] = await Promise.all([
      this.prisma.room.count({
        where: { floor: { building: { propertyId: id } }, archivedAt: null },
      }),
      this.prisma.rentalAgreement.groupBy({
        by: ['status'],
        where: { room: { floor: { building: { propertyId: id } } } },
        _count: { _all: true },
      }),
      this.prisma.room.count({
        where: {
          floor: { building: { propertyId: id } },
          archivedAt: null,
          agreements: { some: { status: { in: ['ACTIVE', 'EXPIRING'] } } },
        },
      }),
    ]);

    return {
      propertyId: id,
      roomCount: rooms,
      occupiedRoomCount: occupancy,
      occupancyRate: rooms === 0 ? 0 : Number(((occupancy / rooms) * 100).toFixed(2)),
      agreementsByStatus: Object.fromEntries(
        agreements.map((entry) => [entry.status, entry._count._all]),
      ),
    };
  }
}
