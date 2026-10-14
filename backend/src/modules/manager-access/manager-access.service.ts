import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ManagerPermission, UserRole } from '../../generated/prisma/enums';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { MailService } from '../../infrastructure/mail/mail.service';
import { assertPropertyAccess } from '../../common/services/property-scope.service';
import type { AuthenticatedUser } from '../../common/types/auth.types';
import type {
  BulkAssignDto,
  CreateAssignmentDto,
  UpdateAssignmentPermissionsDto,
} from './dto/manager-access.dto';

const ASSIGNMENT_INCLUDE = {
  managerUser: {
    select: { id: true, firstName: true, lastName: true, email: true, status: true },
  },
  property: { select: { id: true, name: true, code: true } },
  createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
  permissions: { select: { permission: true } },
} satisfies Prisma.PropertyManagerAssignmentInclude;

export type AssignmentView = Prisma.PropertyManagerAssignmentGetPayload<{
  include: typeof ASSIGNMENT_INCLUDE;
}>;

@Injectable()
export class ManagerAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  async listForProperty(actor: AuthenticatedUser, propertyId: string): Promise<AssignmentView[]> {
    await assertPropertyAccess(this.prisma, actor, propertyId);

    return this.prisma.propertyManagerAssignment.findMany({
      where: { propertyId, revokedAt: null },
      include: ASSIGNMENT_INCLUDE,
      orderBy: { startDate: 'desc' },
    });
  }

  async listForManager(actor: AuthenticatedUser): Promise<AssignmentView[]> {
    return this.prisma.propertyManagerAssignment.findMany({
      where: { managerUserId: actor.id, revokedAt: null },
      include: ASSIGNMENT_INCLUDE,
      orderBy: { startDate: 'desc' },
    });
  }

  async assign(actor: AuthenticatedUser, propertyId: string, dto: CreateAssignmentDto) {
    const access = await assertPropertyAccess(this.prisma, actor, propertyId);
    if (!access.isOwner) {
      throw new ForbiddenException('Only the property owner can assign managers');
    }

    const manager = await this.prisma.user.findUnique({
      where: { id: dto.managerUserId },
      select: { id: true, email: true, role: true, status: true },
    });

    if (!manager) {
      throw new NotFoundException('Manager account not found');
    }

    if (manager.role !== UserRole.PROPERTY_MANAGER) {
      throw new BadRequestException('Target account must have the PROPERTY_MANAGER role');
    }

    if (manager.status === 'DISABLED' || manager.status === 'SUSPENDED') {
      throw new BadRequestException('Manager account is not active');
    }

    const permissions = unique(dto.permissions);
    if (permissions.length === 0) {
      throw new BadRequestException('At least one permission is required');
    }

    const start = new Date(dto.startDate);
    const end = dto.endDate ? new Date(dto.endDate) : null;
    if (end && end.getTime() < start.getTime()) {
      throw new BadRequestException('endDate cannot be before startDate');
    }

    const assignment = await this.prisma.propertyManagerAssignment.create({
      data: {
        propertyId,
        managerUserId: dto.managerUserId,
        createdById: actor.id,
        startDate: start,
        endDate: end,
        permissions: { create: permissions.map((permission) => ({ permission })) },
      },
      include: ASSIGNMENT_INCLUDE,
    });

    await this.mail.sendManagerAssignedEmail(manager.email, assignment.property.name);

    return assignment;
  }

  async bulkAssign(actor: AuthenticatedUser, propertyId: string, dto: BulkAssignDto) {
    const results = [];

    for (const input of dto.assignments) {
      results.push(
        await this.assign(actor, propertyId, {
          managerUserId: input.managerUserId,
          managerRole: UserRole.PROPERTY_MANAGER,
          startDate: input.startDate ?? new Date().toISOString(),
          endDate: input.endDate,
          permissions: input.permissions,
        }),
      );
    }

    return results;
  }

  async replacePermissions(
    actor: AuthenticatedUser,
    assignmentId: string,
    dto: UpdateAssignmentPermissionsDto,
  ): Promise<AssignmentView> {
    const assignment = await this.getAssignment(actor, assignmentId);
    const permissions = unique(dto.permissions);

    if (permissions.length === 0) {
      throw new BadRequestException('At least one permission is required');
    }

    await this.prisma.$transaction([
      this.prisma.propertyManagerPermission.deleteMany({ where: { assignmentId } }),
      this.prisma.propertyManagerPermission.createMany({
        data: permissions.map((permission) => ({ assignmentId, permission })),
        skipDuplicates: true,
      }),
    ]);

    return this.prisma.propertyManagerAssignment.findUniqueOrThrow({
      where: { id: assignment.id },
      include: ASSIGNMENT_INCLUDE,
    });
  }

  async revoke(actor: AuthenticatedUser, assignmentId: string): Promise<AssignmentView> {
    const assignment = await this.getAssignment(actor, assignmentId);

    return this.prisma.propertyManagerAssignment.update({
      where: { id: assignment.id },
      data: { revokedAt: new Date() },
      include: ASSIGNMENT_INCLUDE,
    });
  }

  async myAccess(actor: AuthenticatedUser) {
    if (actor.role !== UserRole.PROPERTY_MANAGER) {
      return { role: actor.role, properties: [] };
    }

    const assignments = await this.prisma.propertyManagerAssignment.findMany({
      where: { managerUserId: actor.id, revokedAt: null },
      include: ASSIGNMENT_INCLUDE,
      orderBy: { startDate: 'desc' },
    });

    return {
      role: actor.role,
      properties: assignments.map((assignment) => ({
        assignmentId: assignment.id,
        propertyId: assignment.propertyId,
        propertyName: assignment.property.name,
        startDate: assignment.startDate,
        endDate: assignment.endDate,
        permissions: assignment.permissions.map((item) => item.permission),
      })),
    };
  }

  async availablePermissions(): Promise<{ permissions: string[] }> {
    return { permissions: Object.values(ManagerPermission) };
  }

  private async getAssignment(actor: AuthenticatedUser, assignmentId: string) {
    const assignment = await this.prisma.propertyManagerAssignment.findUnique({
      where: { id: assignmentId },
      select: { id: true, propertyId: true },
    });

    if (!assignment) {
      throw new NotFoundException('Assignment not found');
    }

    await assertPropertyAccess(this.prisma, actor, assignment.propertyId);

    return assignment;
  }
}

function unique(values: ManagerPermission[]): ManagerPermission[] {
  return [...new Set(values)];
}
