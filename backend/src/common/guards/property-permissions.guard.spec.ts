import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { type Reflector } from '@nestjs/core';
import type { ExecutionContext } from '@nestjs/common';
import { ManagerPermission, UserRole, type UserStatus } from '../../generated/prisma/enums';
import { PropertyPermissionsGuard } from './property-permissions.guard';
import type { AuthenticatedUser } from '../types/auth.types';

const PROPERTY_ID = 'property-1';
const ROOM_ID = 'room-1';

function actor(role: UserRole): AuthenticatedUser {
  return {
    id: 'user-1',
    email: 'actor@example.com',
    role,
    status: 'ACTIVE' as UserStatus,
    authVersion: 1,
    tenantId: null,
  };
}

/**
 * Minimal `Reflector` double: hands back the metadata the route under test declares,
 * keyed the same way `getAllAndOverride(handler, class)` is called.
 */
function reflectorWith(metadata: Record<string, unknown>): Reflector {
  return {
    getAllAndOverride: (key: string) => metadata[key],
  } as unknown as Reflector;
}

function contextFor(request: Record<string, unknown>): ExecutionContext {
  const ctx = {
    getHandler: () => () => undefined,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => request }),
  };

  return ctx as unknown as ExecutionContext;
}

const OWNED = {
  property: { id: PROPERTY_ID },
  room: { floor: { building: { propertyId: PROPERTY_ID } } },
};

describe('PropertyPermissionsGuard', () => {
  describe('no permissions declared', () => {
    it('lets the request through without touching the database', async () => {
      const prisma = {
        property: { findFirst: jest.fn() },
        room: { findUnique: jest.fn() },
      };
      const guard = new PropertyPermissionsGuard(reflectorWith({}), prisma as never);

      await expect(
        guard.canActivate(contextFor({ user: actor(UserRole.TENANT), params: {} })),
      ).resolves.toBe(true);
      expect(prisma.property.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('unauthenticated', () => {
    it('rejects a request with no user', async () => {
      const guard = new PropertyPermissionsGuard(
        reflectorWith({ 'auth:propertyPermissions': [ManagerPermission.MANAGE_ROOMS] }),
        {} as never,
      );

      await expect(guard.canActivate(contextFor({ params: {} }))).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });
  });

  describe('owner', () => {
    it('passes on ownership alone, ignoring the permission set', async () => {
      const request: Record<string, unknown> = {
        user: actor(UserRole.OWNER),
        params: { propertyId: PROPERTY_ID },
      };
      const prisma = {
        property: { findFirst: jest.fn().mockResolvedValue({ id: PROPERTY_ID }) },
        room: { findUnique: jest.fn() },
      };
      const guard = new PropertyPermissionsGuard(
        reflectorWith({
          'auth:propertyPermissions': [ManagerPermission.MANAGE_ROOMS],
        }),
        prisma as never,
      );

      await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
      expect(prisma.property.findFirst).toHaveBeenCalledWith({
        where: { id: PROPERTY_ID, ownerId: 'user-1' },
        select: { id: true },
      });
    });

    it('rejects an owner who does not own the property', async () => {
      const prisma = {
        property: { findFirst: jest.fn().mockResolvedValue(null) },
        room: { findUnique: jest.fn() },
      };
      const guard = new PropertyPermissionsGuard(
        reflectorWith({ 'auth:propertyPermissions': [ManagerPermission.MANAGE_ROOMS] }),
        prisma as never,
      );

      await expect(
        guard.canActivate(
          contextFor({ user: actor(UserRole.OWNER), params: { propertyId: PROPERTY_ID } }),
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('manager AND semantics', () => {
    it('rejects and names the permissions that are missing', async () => {
      const prisma = {
        property: { findFirst: jest.fn() },
        room: { findUnique: jest.fn() },
        propertyManagerAssignment: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'assignment-1',
            propertyId: PROPERTY_ID,
            managerUserId: 'user-1',
            startDate: new Date(),
            endDate: null,
            permissions: [{ permission: ManagerPermission.MANAGE_ROOMS }],
          }),
        },
      };
      const guard = new PropertyPermissionsGuard(
        reflectorWith({
          'auth:propertyPermissions': [
            ManagerPermission.MANAGE_ROOMS,
            ManagerPermission.MANAGE_INVENTORY,
          ],
        }),
        prisma as never,
      );

      await expect(
        guard.canActivate(
          contextFor({
            user: actor(UserRole.PROPERTY_MANAGER),
            params: { propertyId: PROPERTY_ID },
          }),
        ),
      ).rejects.toThrow(/MANAGE_INVENTORY/);
    });
  });

  describe('manager OR semantics', () => {
    it('passes when only one of the alternative permissions is held', async () => {
      const prisma = managerPrisma([{ permission: ManagerPermission.MANAGE_RENT }]);
      const guard = new PropertyPermissionsGuard(
        reflectorWith({
          'auth:propertyAnyPermissions': [
            ManagerPermission.MANAGE_AGREEMENTS,
            ManagerPermission.MANAGE_RENT,
          ],
        }),
        prisma as never,
      );

      await expect(
        guard.canActivate(
          contextFor({
            user: actor(UserRole.PROPERTY_MANAGER),
            params: { propertyId: PROPERTY_ID },
          }),
        ),
      ).resolves.toBe(true);
    });

    it('rejects when none of the alternative permissions is held', async () => {
      const prisma = managerPrisma([{ permission: ManagerPermission.MANAGE_ROOMS }]);
      const guard = new PropertyPermissionsGuard(
        reflectorWith({
          'auth:propertyAnyPermissions': [
            ManagerPermission.MANAGE_AGREEMENTS,
            ManagerPermission.MANAGE_RENT,
          ],
        }),
        prisma as never,
      );

      await expect(
        guard.canActivate(
          contextFor({
            user: actor(UserRole.PROPERTY_MANAGER),
            params: { propertyId: PROPERTY_ID },
          }),
        ),
      ).rejects.toThrow(/Requires one of the permissions/);
    });
  });

  describe('property resolution from the request body', () => {
    it('resolves the property through the declared body field', async () => {
      const prisma = managerPrisma([{ permission: ManagerPermission.MANAGE_AGREEMENTS }]);
      prisma.room.findUnique.mockResolvedValue(OWNED.room);
      const guard = new PropertyPermissionsGuard(
        reflectorWith({
          'auth:propertyPermissions': [ManagerPermission.MANAGE_AGREEMENTS],
          'auth:propertySource': 'room',
          'auth:propertySourceBodyField': 'roomId',
        }),
        prisma as never,
      );

      await expect(
        guard.canActivate(
          contextFor({
            user: actor(UserRole.PROPERTY_MANAGER),
            params: {},
            body: { roomId: ROOM_ID },
          }),
        ),
      ).resolves.toBe(true);
      expect(prisma.room.findUnique).toHaveBeenCalled();
    });

    it('rejects when the body field is absent and nothing else resolves', async () => {
      const prisma = managerPrisma([]);
      const guard = new PropertyPermissionsGuard(
        reflectorWith({
          'auth:propertyPermissions': [ManagerPermission.MANAGE_AGREEMENTS],
          'auth:propertySource': 'room',
          'auth:propertySourceBodyField': 'roomId',
        }),
        prisma as never,
      );

      await expect(
        guard.canActivate(
          contextFor({ user: actor(UserRole.PROPERTY_MANAGER), params: {}, body: {} }),
        ),
      ).rejects.toThrow(/Property context could not be resolved/);
    });
  });

  describe('tenant', () => {
    it('can never manage properties', async () => {
      const guard = new PropertyPermissionsGuard(
        reflectorWith({ 'auth:propertyPermissions': [ManagerPermission.MANAGE_ROOMS] }),
        { property: { findFirst: jest.fn() } } as never,
      );

      await expect(
        guard.canActivate(
          contextFor({ user: actor(UserRole.TENANT), params: { propertyId: PROPERTY_ID } }),
        ),
      ).rejects.toThrow(/Your role cannot manage properties/);
    });
  });
});

function managerPrisma(permissions: { permission: string }[]) {
  return {
    property: { findFirst: jest.fn() },
    room: { findUnique: jest.fn().mockResolvedValue(OWNED.room) },
    propertyManagerAssignment: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'assignment-1',
        propertyId: PROPERTY_ID,
        managerUserId: 'user-1',
        startDate: new Date(),
        endDate: null,
        permissions,
      }),
    },
  };
}
