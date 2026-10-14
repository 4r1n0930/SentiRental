import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { RoomOperationalStatus } from '../../generated/prisma/enums';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { paginate, resolvePagination, type Paginated } from '../../common/dto/pagination.dto';
import {
  asNestedWhere,
  assertPropertyAccess,
  scopePropertiesForActor,
} from '../../common/services/property-scope.service';
import type { AuthenticatedUser } from '../../common/types/auth.types';
import type {
  CreateRoomDto,
  ListRoomsQueryDto,
  SetRoomAmenitiesDto,
  UpdateRoomDto,
} from './dto/rooms.dto';

const ROOM_INCLUDE = {
  floor: {
    select: {
      id: true,
      code: true,
      name: true,
      building: { select: { id: true, name: true, propertyId: true } },
    },
  },
  amenities: { include: { amenity: true } },
  agreements: {
    orderBy: { startDate: 'desc' as const },
    take: 1,
    select: { id: true, status: true, startDate: true, endDate: true },
  },
} satisfies Prisma.RoomInclude;

export type RoomView = Prisma.RoomGetPayload<{ include: typeof ROOM_INCLUDE }>;

@Injectable()
export class RoomsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(actor: AuthenticatedUser, dto: CreateRoomDto): Promise<RoomView> {
    const propertyId = await this.propertyIdForFloor(dto.floorId);
    await assertPropertyAccess(this.prisma, actor, propertyId);

    if (dto.amenityIds?.length) {
      await this.assertAmenitiesExist(dto.amenityIds);
    }

    const room = await this.prisma.room.create({
      data: {
        floorId: dto.floorId,
        number: dto.number.trim(),
        type: dto.type,
        capacity: dto.capacity,
        baseRentAmount: new Prisma.Decimal(dto.baseRentAmount ?? 0),
        currency: (dto.currency ?? 'INR').toUpperCase(),
        ...(dto.amenityIds?.length
          ? {
              amenities: {
                create: dto.amenityIds.map((amenityId) => ({ amenityId, addedById: actor.id })),
              },
            }
          : {}),
      },
    });

    return this.findById(actor, room.id);
  }

  async list(actor: AuthenticatedUser, query: ListRoomsQueryDto): Promise<Paginated<RoomView>> {
    const { page, perPage, skip, sortOrder } = resolvePagination(query);

    const where: Prisma.RoomWhereInput = {
      ...(query.floorId ? { floorId: query.floorId } : {}),
      ...(query.operationalStatus ? { operationalStatus: query.operationalStatus } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.search ? { number: { contains: query.search, mode: 'insensitive' } } : {}),
      archivedAt: null,
      floor: {
        is: {
          building: {
            is: asNestedWhere<Prisma.BuildingWhereInput>(scopePropertiesForActor(actor)),
          },
        },
      },
    };

    const [total, items] = await Promise.all([
      this.prisma.room.count({ where }),
      this.prisma.room.findMany({
        where,
        include: ROOM_INCLUDE,
        orderBy: { createdAt: sortOrder },
        skip,
        take: perPage,
      }),
    ]);

    return paginate(Promise.resolve(total), Promise.resolve(items), page, perPage);
  }

  async findById(actor: AuthenticatedUser, id: string): Promise<RoomView> {
    await this.assertRoomAccess(actor, id);

    const room = await this.prisma.room.findUnique({ where: { id }, include: ROOM_INCLUDE });

    if (!room) {
      throw new NotFoundException('Room not found');
    }

    return room;
  }

  async update(actor: AuthenticatedUser, id: string, dto: UpdateRoomDto): Promise<RoomView> {
    await this.assertRoomAccess(actor, id);

    await this.prisma.room.update({
      where: { id },
      data: {
        ...(dto.number !== undefined ? { number: dto.number.trim() } : {}),
        ...(dto.type !== undefined ? { type: dto.type } : {}),
        ...(dto.capacity !== undefined ? { capacity: dto.capacity } : {}),
        ...(dto.baseRentAmount !== undefined
          ? { baseRentAmount: new Prisma.Decimal(dto.baseRentAmount) }
          : {}),
        ...(dto.operationalStatus !== undefined
          ? { operationalStatus: dto.operationalStatus }
          : {}),
      },
    });

    return this.findById(actor, id);
  }

  async setOperationalStatus(
    actor: AuthenticatedUser,
    id: string,
    status: RoomOperationalStatus,
  ): Promise<RoomView> {
    if (status === RoomOperationalStatus.INACTIVE) {
      const activeAgreement = await this.prisma.rentalAgreement.findFirst({
        where: { roomId: id, status: { in: ['ACTIVE', 'EXPIRING'] } },
        select: { id: true },
      });

      if (activeAgreement) {
        throw new ConflictException('Terminate the active agreement before deactivating the room');
      }
    }

    return this.update(actor, id, { operationalStatus: status });
  }

  async archive(actor: AuthenticatedUser, id: string): Promise<RoomView> {
    const activeAgreement = await this.prisma.rentalAgreement.findFirst({
      where: { roomId: id, status: { in: ['ACTIVE', 'EXPIRING'] } },
      select: { id: true },
    });

    if (activeAgreement) {
      throw new ConflictException('Terminate the active agreement before archiving the room');
    }

    await this.update(actor, id, { operationalStatus: RoomOperationalStatus.INACTIVE });
    await this.prisma.room.update({ where: { id }, data: { archivedAt: new Date() } });

    return this.findById(actor, id);
  }

  async setAmenities(
    actor: AuthenticatedUser,
    id: string,
    dto: SetRoomAmenitiesDto,
  ): Promise<RoomView> {
    await this.assertRoomAccess(actor, id);
    await this.assertAmenitiesExist(dto.amenityIds);

    await this.prisma.$transaction([
      this.prisma.roomAmenity.deleteMany({ where: { roomId: id } }),
      this.prisma.roomAmenity.createMany({
        data: dto.amenityIds.map((amenityId) => ({ roomId: id, amenityId, addedById: actor.id })),
        skipDuplicates: true,
      }),
    ]);

    return this.findById(actor, id);
  }

  private async assertRoomAccess(actor: AuthenticatedUser, id: string): Promise<void> {
    const room = await this.prisma.room.findUnique({
      where: { id },
      select: { floor: { select: { building: { select: { propertyId: true } } } } },
    });

    if (!room) {
      throw new NotFoundException('Room not found');
    }

    await assertPropertyAccess(this.prisma, actor, room.floor.building.propertyId);
  }

  private async propertyIdForFloor(floorId: string): Promise<string> {
    const floor = await this.prisma.floor.findUnique({
      where: { id: floorId },
      select: { building: { select: { propertyId: true } } },
    });

    if (!floor) {
      throw new NotFoundException('Floor not found');
    }

    return floor.building.propertyId;
  }

  private async assertAmenitiesExist(amenityIds: string[]): Promise<void> {
    const count = await this.prisma.amenity.count({
      where: { id: { in: amenityIds }, isActive: true },
    });

    if (count !== new Set(amenityIds).size) {
      throw new NotFoundException('One or more amenities are unknown or inactive');
    }
  }
}
