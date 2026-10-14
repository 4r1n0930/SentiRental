import type { ManagerPermission, UserRole, UserStatus } from '../../generated/prisma/enums';

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  authVersion: number;
  tenantId: string | null;
}

export interface AccessTokenPayload {
  sub: string;
  role: UserRole;
  ver: number;
  typ: 'access';
}

export interface RequestActor {
  id: string;
  role: UserRole;
}

export interface PropertyAccess {
  propertyId: string;
  isOwner: boolean;
  permissions: ManagerPermission[];
}
