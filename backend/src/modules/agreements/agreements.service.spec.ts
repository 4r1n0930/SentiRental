import { ForbiddenException } from '@nestjs/common';
import { UserRole, type UserStatus } from '../../generated/prisma/enums';
import { AgreementsService } from './agreements.service';
import type { AuthenticatedUser } from '../../common/types/auth.types';

const PROPERTY_ID = 'property-1';

function actor(role: UserRole, id = 'user-1'): AuthenticatedUser {
  return {
    id,
    email: 'actor@example.com',
    role,
    status: 'ACTIVE' as UserStatus,
    authVersion: 1,
    tenantId: null,
  };
}

function serviceWithAssignment(assigned: boolean) {
  const prisma = {
    property: {
      findUnique: jest.fn().mockResolvedValue(
        assigned
          ? {
              id: PROPERTY_ID,
              ownerId: 'owner-1',
              managerAssignments: [{ id: 'assignment-1' }],
            }
          : { id: PROPERTY_ID, ownerId: 'owner-1', managerAssignments: [] },
      ),
    },
    rentalAgreement: { findUnique: jest.fn() },
  };

  return { service: new AgreementsService(prisma as never), prisma };
}

describe('AgreementsService.assertScope', () => {
  it('rejects a manager with no assignment on the property', async () => {
    const { service } = serviceWithAssignment(false);

    await expect(
      service['assertScope'](actor(UserRole.PROPERTY_MANAGER), PROPERTY_ID),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('accepts a manager holding an active assignment', async () => {
    const { service } = serviceWithAssignment(true);

    await expect(
      service['assertScope'](actor(UserRole.PROPERTY_MANAGER), PROPERTY_ID),
    ).resolves.toBeUndefined();
  });

  it('accepts the owner of the property', async () => {
    const { service } = serviceWithAssignment(false);

    await expect(
      service['assertScope'](actor(UserRole.OWNER, 'owner-1'), PROPERTY_ID),
    ).resolves.toBeUndefined();
  });

  it('lets tenants through, leaving the party check to the caller', async () => {
    const { service, prisma } = serviceWithAssignment(false);

    await expect(
      service['assertScope'](actor(UserRole.TENANT), PROPERTY_ID),
    ).resolves.toBeUndefined();
    expect(prisma.property.findUnique).not.toHaveBeenCalled();
  });
});
