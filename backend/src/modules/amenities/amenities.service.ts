import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { paginate, resolvePagination, type Paginated } from '../../common/dto/pagination.dto';
import type {
  CreateAmenityDto,
  ListAmenitiesQueryDto,
  UpdateAmenityDto,
} from './dto/amenities.dto';

const AMENITY_SELECT = {
  id: true,
  code: true,
  name: true,
  category: true,
  isActive: true,
  _count: { select: { rooms: true } },
} satisfies Prisma.AmenitySelect;

export type AmenityView = Prisma.AmenityGetPayload<{ select: typeof AMENITY_SELECT }>;

@Injectable()
export class AmenitiesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListAmenitiesQueryDto): Promise<Paginated<AmenityView>> {
    const { page, perPage, skip, sortOrder } = resolvePagination(query);

    const where: Prisma.AmenityWhereInput = {
      ...(query.category ? { category: query.category } : {}),
      ...(query.isActive === undefined ? {} : { isActive: query.isActive }),
    };

    const [total, items] = await Promise.all([
      this.prisma.amenity.count({ where }),
      this.prisma.amenity.findMany({
        where,
        select: AMENITY_SELECT,
        orderBy: { name: sortOrder },
        skip,
        take: perPage,
      }),
    ]);

    return paginate(Promise.resolve(total), Promise.resolve(items), page, perPage);
  }

  async findById(id: string): Promise<AmenityView> {
    const amenity = await this.prisma.amenity.findUnique({ where: { id }, select: AMENITY_SELECT });

    if (!amenity) {
      throw new NotFoundException('Amenity not found');
    }

    return amenity;
  }

  async create(dto: CreateAmenityDto): Promise<AmenityView> {
    const amenity = await this.prisma.amenity.create({
      data: {
        code: dto.code.trim().toLowerCase(),
        name: dto.name.trim(),
        category: dto.category?.trim() ?? null,
      },
      select: AMENITY_SELECT,
    });

    return amenity;
  }

  async update(id: string, dto: UpdateAmenityDto): Promise<AmenityView> {
    const existing = await this.prisma.amenity.findUnique({ where: { id }, select: { id: true } });
    if (!existing) {
      throw new NotFoundException('Amenity not found');
    }

    return this.prisma.amenity.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.category !== undefined ? { category: dto.category?.trim() || null } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
      select: AMENITY_SELECT,
    });
  }
}
