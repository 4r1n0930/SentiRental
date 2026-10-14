import { ForbiddenException } from '@nestjs/common';
import { UserRole } from '../../generated/prisma/enums';
import type { Prisma } from '../../generated/prisma/client';
import type { PrismaService } from '../../infrastructure/prisma/prisma.service';
import type { AuthenticatedUser } from '../types/auth.types';

function startOfToday(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/**
 * Restricts a property query to what the actor is allowed to see: owners see
 * their own portfolio, property managers only their active assignments.
 */
export function scopePropertiesForActor(
  actor: AuthenticatedUser,
  where: Prisma.PropertyWhereInput = {},
): Prisma.PropertyWhereInput {
  if (actor.role === UserRole.OWNER) {
    return { ...where, ownerId: actor.id };
  }

  if (actor.role === UserRole.PROPERTY_MANAGER) {
    const today = startOfToday();

    return {
      ...where,
      managerAssignments: {
        some: {
          managerUserId: actor.id,
          revokedAt: null,
          startDate: { lte: today },
          OR: [{ endDate: null }, { endDate: { gte: today } }],
        },
      },
    };
  }

  throw new ForbiddenException('Your role cannot access property data');
}

/**
 * Prisma 7 types to-one relation filters as a union of two shapes and cannot prove
 * `PropertyWhereInput` assignable to `BuildingWhereInput`, so nested property scopes
 * are narrowed once here instead of casting at every call site.
 */
export function asNestedWhere<T extends object>(input: Prisma.PropertyWhereInput): T {
  return input as unknown as T;
}

export async function assertPropertyAccess(
  prisma: PrismaService,
  actor: AuthenticatedUser,
  propertyId: string,
): Promise<{ propertyId: string; ownerId: string; isOwner: boolean }> {
  const property = await prisma.property.findUnique({
    where: { id: propertyId },
    select: {
      id: true,
      ownerId: true,
      managerAssignments: {
        where: { managerUserId: actor.id, revokedAt: null },
        select: { id: true },
        take: 1,
      },
    },
  });

  if (!property) {
    throw new ForbiddenException('Property not found or not accessible');
  }

  const isOwner = property.ownerId === actor.id;

  if (!isOwner && property.managerAssignments.length === 0) {
    throw new ForbiddenException('You have no assignment for this property');
  }

  return { propertyId: property.id, ownerId: property.ownerId, isOwner };
}
