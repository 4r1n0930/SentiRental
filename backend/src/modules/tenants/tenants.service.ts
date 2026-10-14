import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { KycStatus, TenantStatus, UserRole } from '../../generated/prisma/enums';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { paginate, resolvePagination, type Paginated } from '../../common/dto/pagination.dto';
import type { AuthenticatedUser } from '../../common/types/auth.types';
import type {
  SearchTenantsQueryDto,
  UpdateKycDto,
  UpdateTenantProfileDto,
  UpdateTenantStatusDto,
} from './dto/tenants.dto';

const TENANT_VIEW_SELECT = {
  id: true,
  userId: true,
  status: true,
  phone: true,
  alternatePhone: true,
  addressLine1: true,
  addressLine2: true,
  city: true,
  state: true,
  postalCode: true,
  countryCode: true,
  kycStatus: true,
  kycReference: true,
  kycVerifiedAt: true,
  emergencyContactName: true,
  emergencyContactPhone: true,
  emergencyContactRelation: true,
  archivedAt: true,
  createdAt: true,
  updatedAt: true,
  user: { select: { id: true, email: true, firstName: true, lastName: true, status: true } },
} satisfies Prisma.TenantSelect;

export type TenantView = Prisma.TenantGetPayload<{ select: typeof TENANT_VIEW_SELECT }>;

@Injectable()
export class TenantsService {
  constructor(private readonly prisma: PrismaService) {}

  async findMe(actor: AuthenticatedUser): Promise<TenantView> {
    if (!actor.tenantId) {
      throw new NotFoundException('No tenant profile is linked to this account');
    }

    return this.findById(actor.tenantId);
  }

  async findById(id: string): Promise<TenantView> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id },
      select: TENANT_VIEW_SELECT,
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    return tenant;
  }

  async search(query: SearchTenantsQueryDto): Promise<Paginated<TenantView>> {
    const { page, perPage, skip, sortOrder } = resolvePagination(query);

    const where: Prisma.TenantWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.kycStatus ? { kycStatus: query.kycStatus } : {}),
      ...(query.search
        ? {
            OR: [
              { user: { email: { contains: query.search, mode: 'insensitive' } } },
              { user: { firstName: { contains: query.search, mode: 'insensitive' } } },
              { city: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [total, items] = await Promise.all([
      this.prisma.tenant.count({ where }),
      this.prisma.tenant.findMany({
        where,
        select: TENANT_VIEW_SELECT,
        orderBy: { createdAt: sortOrder },
        skip,
        take: perPage,
      }),
    ]);

    return paginate(Promise.resolve(total), Promise.resolve(items), page, perPage);
  }

  async updateOwnProfile(
    actor: AuthenticatedUser,
    dto: UpdateTenantProfileDto,
  ): Promise<TenantView> {
    this.assertTenantAccess(actor);
    const tenantId = actor.tenantId as string;

    await this.prisma.tenant.update({ where: { id: tenantId }, data: this.toData(dto) });

    return this.findById(tenantId);
  }

  async updateProfileByStaff(id: string, dto: UpdateTenantProfileDto): Promise<TenantView> {
    await this.prisma.tenant.update({ where: { id }, data: this.toData(dto) });

    return this.findById(id);
  }

  async setStatus(id: string, dto: UpdateTenantStatusDto): Promise<TenantView> {
    if (dto.status === TenantStatus.MOVED_OUT || dto.status === TenantStatus.ARCHIVED) {
      const hasActiveAgreement = await this.prisma.agreementTenant.findFirst({
        where: { tenantId: id, agreement: { status: { in: ['ACTIVE', 'EXPIRING'] } } },
        select: { id: true },
      });

      if (hasActiveAgreement) {
        throw new ForbiddenException('Terminate the active agreement before moving the tenant out');
      }
    }

    await this.prisma.tenant.update({
      where: { id },
      data: {
        status: dto.status,
        archivedAt: dto.status === TenantStatus.ARCHIVED ? new Date() : null,
      },
    });

    return this.findById(id);
  }

  async setKyc(id: string, dto: UpdateKycDto): Promise<TenantView> {
    await this.prisma.tenant.update({
      where: { id },
      data: {
        kycStatus: dto.kycStatus,
        kycReference: dto.kycReference ?? null,
        kycVerifiedAt: dto.kycStatus === KycStatus.VERIFIED ? new Date() : null,
      },
    });

    return this.findById(id);
  }

  private assertTenantAccess(actor: AuthenticatedUser): void {
    if (actor.role === UserRole.TENANT && !actor.tenantId) {
      throw new NotFoundException('No tenant profile is linked to this account');
    }
  }

  private toData(dto: UpdateTenantProfileDto): Prisma.TenantUpdateInput {
    return {
      ...(dto.phone !== undefined ? { phone: dto.phone || null } : {}),
      ...(dto.alternatePhone !== undefined ? { alternatePhone: dto.alternatePhone || null } : {}),
      ...(dto.addressLine1 !== undefined ? { addressLine1: dto.addressLine1 || null } : {}),
      ...(dto.addressLine2 !== undefined ? { addressLine2: dto.addressLine2 || null } : {}),
      ...(dto.city !== undefined ? { city: dto.city || null } : {}),
      ...(dto.state !== undefined ? { state: dto.state || null } : {}),
      ...(dto.postalCode !== undefined ? { postalCode: dto.postalCode || null } : {}),
      ...(dto.countryCode !== undefined ? { countryCode: dto.countryCode.toUpperCase() } : {}),
      ...(dto.emergencyContactName !== undefined
        ? { emergencyContactName: dto.emergencyContactName || null }
        : {}),
      ...(dto.emergencyContactPhone !== undefined
        ? { emergencyContactPhone: dto.emergencyContactPhone || null }
        : {}),
      ...(dto.emergencyContactRelation !== undefined
        ? { emergencyContactRelation: dto.emergencyContactRelation || null }
        : {}),
    };
  }
}
