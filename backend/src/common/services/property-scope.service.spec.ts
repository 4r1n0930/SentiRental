import { ForbiddenException } from '@nestjs/common';
import { UserRole, type UserStatus } from '../../generated/prisma/enums';
import { scopePropertiesForActor } from './property-scope.service';
import type { AuthenticatedUser } from '../types/auth.types';

const today = new Date().toISOString().slice(0, 10);

function actor(role: UserRole): AuthenticatedUser {
  return {
    id: 'user-1',
    email: 'user@example.com',
    role,
    status: 'ACTIVE' as UserStatus,
    authVersion: 1,
    tenantId: null,
  };
}

describe('scopePropertiesForActor', () => {
  it('scopes owners to their own portfolio', () => {
    const where = scopePropertiesForActor(actor(UserRole.OWNER), { status: 'ACTIVE' });

    expect(where).toEqual({ status: 'ACTIVE', ownerId: 'user-1' });
  });

  it('scopes property managers to active assignments', () => {
    const where = scopePropertiesForActor(actor(UserRole.PROPERTY_MANAGER));

    expect(where.ownerId).toBeUndefined();
    expect(where.managerAssignments).toEqual({
      some: {
        managerUserId: 'user-1',
        revokedAt: null,
        startDate: { lte: expect.any(Date) },
        OR: [{ endDate: null }, { endDate: { gte: expect.any(Date) } }],
      },
    });
  });

  it('rejects tenants', () => {
    expect(() => scopePropertiesForActor(actor(UserRole.TENANT))).toThrow(ForbiddenException);
  });

  it('uses today as the assignment boundary', () => {
    const assignment = (
      scopePropertiesForActor(actor(UserRole.PROPERTY_MANAGER)).managerAssignments as {
        some: { startDate: { lte: Date } };
      }
    ).some;

    expect(assignment.startDate.lte.toISOString().slice(0, 10)).toBe(today);
  });
});
