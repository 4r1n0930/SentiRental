import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import {
  PROPERTY_ANY_PERMISSIONS_KEY,
  PROPERTY_PERMISSIONS_KEY,
  PROPERTY_SOURCE_BODY_FIELD_KEY,
  PROPERTY_SOURCE_KEY,
  type PropertyScopedResource,
} from '../decorators/require-property-permissions.decorator';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { ManagerPermission, UserRole } from '../../generated/prisma/enums';
import type { AuthenticatedUser, PropertyAccess } from '../types/auth.types';
import {
  findActiveAssignment,
  resolvePropertyIdForResource,
} from '../services/property-access.service';

interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
  propertyAccess?: PropertyAccess;
}

/**
 * Enforces per-property authorization. The property is resolved from the
 * `propertyId` param, the request body, or the resource declared with
 * `@PropertyScopedBy()` (default: `:propertyId`).
 */
@Injectable()
export class PropertyPermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];

    const required = this.reflector.getAllAndOverride<ManagerPermission[] | undefined>(
      PROPERTY_PERMISSIONS_KEY,
      targets,
    );

    const anyRequired = this.reflector.getAllAndOverride<ManagerPermission[] | undefined>(
      PROPERTY_ANY_PERMISSIONS_KEY,
      targets,
    );

    if ((!required || required.length === 0) && (!anyRequired || anyRequired.length === 0)) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;

    if (!user) {
      throw new UnauthorizedException('Authentication is required');
    }

    const propertyId = await this.resolvePropertyId(request, context);

    if (!propertyId) {
      throw new ForbiddenException('Property context could not be resolved for this route');
    }

    if (user.role === UserRole.OWNER) {
      const owned = await this.prisma.property.findFirst({
        where: { id: propertyId, ownerId: user.id },
        select: { id: true },
      });

      if (!owned) {
        throw new ForbiddenException('You do not have access to this property');
      }

      request.propertyAccess = { propertyId, isOwner: true, permissions: [] };
      return true;
    }

    if (user.role === UserRole.PROPERTY_MANAGER) {
      const assignment = await findActiveAssignment(this.prisma, user.id, propertyId);
      const held = new Set<ManagerPermission>(
        assignment?.permissions.map((item) => item.permission as ManagerPermission) ?? [],
      );

      const missing = (required ?? []).filter((permission) => !held.has(permission));

      if (missing.length > 0) {
        throw new ForbiddenException(`Missing permissions: ${missing.join(', ')}`);
      }

      if (anyRequired && anyRequired.length > 0) {
        const satisfied = anyRequired.some((permission) => held.has(permission));

        if (!satisfied) {
          throw new ForbiddenException(
            `Requires one of the permissions: ${anyRequired.join(', ')}`,
          );
        }
      }

      request.propertyAccess = { propertyId, isOwner: false, permissions: [...held] };
      return true;
    }

    throw new ForbiddenException('Your role cannot manage properties');
  }

  private async resolvePropertyId(
    request: AuthenticatedRequest,
    context: ExecutionContext,
  ): Promise<string | undefined> {
    const source = this.reflector.getAllAndOverride<PropertyScopedResource | undefined>(
      PROPERTY_SOURCE_KEY,
      [context.getHandler(), context.getClass()],
    );

    const bodyField = this.reflector.getAllAndOverride<string | undefined>(
      PROPERTY_SOURCE_BODY_FIELD_KEY,
      [context.getHandler(), context.getClass()],
    );

    const resourceId =
      (request.params?.id as string | undefined) ??
      (bodyField ? (request.body as Record<string, unknown> | undefined)?.[bodyField] : undefined);

    if (source && typeof resourceId === 'string' && resourceId.length > 0) {
      return (await resolvePropertyIdForResource(this.prisma, source, resourceId)) ?? undefined;
    }

    return (
      (request.params?.propertyId as string | undefined) ??
      (request.body as { propertyId?: string } | undefined)?.propertyId
    );
  }
}
