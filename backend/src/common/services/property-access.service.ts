import type { PrismaService } from '../../infrastructure/prisma/prisma.service';

export interface ActiveAssignment {
  id: string;
  propertyId: string;
  managerUserId: string;
  startDate: Date;
  endDate: Date | null;
  permissions: { permission: string }[];
}

function startOfToday(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export async function findActiveAssignment(
  prisma: PrismaService,
  managerUserId: string,
  propertyId: string,
): Promise<ActiveAssignment | null> {
  const today = startOfToday();

  const assignment = await prisma.propertyManagerAssignment.findFirst({
    where: {
      propertyId,
      managerUserId,
      revokedAt: null,
      startDate: { lte: today },
      OR: [{ endDate: null }, { endDate: { gte: today } }],
    },
    select: {
      id: true,
      propertyId: true,
      managerUserId: true,
      startDate: true,
      endDate: true,
      permissions: { select: { permission: true } },
    },
  });

  return assignment;
}

export type PropertyScopedResource = 'property' | 'building' | 'floor' | 'room' | 'agreement';

/** Walks up the hierarchy to find the property that owns a given resource. */
export async function resolvePropertyIdForResource(
  prisma: PrismaService,
  resource: PropertyScopedResource,
  id: string,
): Promise<string | null> {
  switch (resource) {
    case 'property': {
      const property = await prisma.property.findUnique({
        where: { id },
        select: { id: true },
      });
      return property?.id ?? null;
    }
    case 'building': {
      const building = await prisma.building.findUnique({
        where: { id },
        select: { propertyId: true },
      });
      return building?.propertyId ?? null;
    }
    case 'floor': {
      const floor = await prisma.floor.findUnique({
        where: { id },
        select: { building: { select: { propertyId: true } } },
      });
      return floor?.building.propertyId ?? null;
    }
    case 'room': {
      const room = await prisma.room.findUnique({
        where: { id },
        select: { floor: { select: { building: { select: { propertyId: true } } } } },
      });
      return room?.floor.building.propertyId ?? null;
    }
    case 'agreement': {
      const agreement = await prisma.rentalAgreement.findUnique({
        where: { id },
        select: {
          room: { select: { floor: { select: { building: { select: { propertyId: true } } } } } },
        },
      });
      return agreement?.room.floor.building.propertyId ?? null;
    }
    default:
      return null;
  }
}
