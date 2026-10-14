import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { assertPropertyAccess } from '../../common/services/property-scope.service';
import type { AuthenticatedUser } from '../../common/types/auth.types';
import type {
  CreateBuildingDto,
  CreateFloorDto,
  UpdateBuildingDto,
  UpdateFloorDto,
} from './dto/structures.dto';

const BUILDING_INCLUDE = {
  floors: {
    where: { archivedAt: null },
    orderBy: { code: 'asc' },
    select: {
      id: true,
      code: true,
      name: true,
      level: true,
      _count: { select: { rooms: true } },
    },
  },
} satisfies Prisma.BuildingInclude;

export type BuildingView = Prisma.BuildingGetPayload<{ include: typeof BUILDING_INCLUDE }>;

@Injectable()
export class StructuresService {
  constructor(private readonly prisma: PrismaService) {}

  async listBuildings(actor: AuthenticatedUser, propertyId: string): Promise<BuildingView[]> {
    await assertPropertyAccess(this.prisma, actor, propertyId);

    return this.prisma.building.findMany({
      where: { propertyId, archivedAt: null },
      include: BUILDING_INCLUDE,
      orderBy: { code: 'asc' },
    });
  }

  async createBuilding(
    actor: AuthenticatedUser,
    propertyId: string,
    dto: CreateBuildingDto,
  ): Promise<BuildingView> {
    await assertPropertyAccess(this.prisma, actor, propertyId);

    const building = await this.prisma.building.create({
      data: {
        propertyId,
        code: dto.code.trim().toUpperCase(),
        name: dto.name.trim(),
      },
    });

    return this.getBuilding(actor, building.id);
  }

  async getBuilding(actor: AuthenticatedUser, buildingId: string): Promise<BuildingView> {
    const building = await this.prisma.building.findUnique({
      where: { id: buildingId },
      include: { property: { select: { id: true } } },
    });

    if (!building) {
      throw new NotFoundException('Building not found');
    }

    await assertPropertyAccess(this.prisma, actor, building.propertyId);

    return this.prisma.building.findUniqueOrThrow({
      where: { id: buildingId },
      include: BUILDING_INCLUDE,
    });
  }

  async updateBuilding(
    actor: AuthenticatedUser,
    buildingId: string,
    dto: UpdateBuildingDto,
  ): Promise<BuildingView> {
    await this.getBuilding(actor, buildingId);

    await this.prisma.building.update({
      where: { id: buildingId },
      data: { ...(dto.name !== undefined ? { name: dto.name.trim() } : {}) },
    });

    return this.getBuilding(actor, buildingId);
  }

  async archiveBuilding(actor: AuthenticatedUser, buildingId: string): Promise<BuildingView> {
    await this.getBuilding(actor, buildingId);

    await this.prisma.building.update({
      where: { id: buildingId },
      data: { archivedAt: new Date() },
    });

    return this.getBuilding(actor, buildingId);
  }

  async createFloor(
    actor: AuthenticatedUser,
    buildingId: string,
    dto: CreateFloorDto,
  ): Promise<{ id: string; code: string; name: string; level: number | null }> {
    const building = await this.getBuilding(actor, buildingId);

    return this.prisma.floor.create({
      data: {
        buildingId: building.id,
        code: dto.code.trim().toUpperCase(),
        name: dto.name.trim(),
        level: dto.level ?? null,
      },
      select: { id: true, code: true, name: true, level: true },
    });
  }

  async updateFloor(
    actor: AuthenticatedUser,
    floorId: string,
    dto: UpdateFloorDto,
  ): Promise<{ id: string; code: string; name: string; level: number | null }> {
    const floor = await this.getFloor(actor, floorId);

    await this.prisma.floor.update({
      where: { id: floor.id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.level !== undefined ? { level: dto.level } : {}),
      },
    });

    return this.prisma.floor.findUniqueOrThrow({
      where: { id: floor.id },
      select: { id: true, code: true, name: true, level: true },
    });
  }

  async archiveFloor(actor: AuthenticatedUser, floorId: string): Promise<void> {
    const floor = await this.getFloor(actor, floorId);

    await this.prisma.floor.update({ where: { id: floor.id }, data: { archivedAt: new Date() } });
  }

  private async getFloor(actor: AuthenticatedUser, floorId: string) {
    const floor = await this.prisma.floor.findUnique({
      where: { id: floorId },
      select: { id: true, building: { select: { propertyId: true } } },
    });

    if (!floor) {
      throw new NotFoundException('Floor not found');
    }

    await assertPropertyAccess(this.prisma, actor, floor.building.propertyId);

    return floor;
  }
}
