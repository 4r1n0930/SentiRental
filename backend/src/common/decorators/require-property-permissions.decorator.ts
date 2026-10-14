import { SetMetadata, applyDecorators } from '@nestjs/common';
import type { ManagerPermission } from '../../generated/prisma/enums';

export const PROPERTY_PERMISSIONS_KEY = 'auth:propertyPermissions';

export const PROPERTY_ANY_PERMISSIONS_KEY = 'auth:propertyAnyPermissions';

export const PROPERTY_SOURCE_KEY = 'auth:propertySource';

export const PROPERTY_SOURCE_BODY_FIELD_KEY = 'auth:propertySourceBodyField';

export type PropertyScopedResource = 'property' | 'building' | 'floor' | 'room' | 'agreement';

/**
 * Grants access to property-scoped routes. OWNER always passes, PROPERTY_MANAGER
 * must hold an active assignment carrying every listed permission.
 */
export const RequirePropertyPermissions = (...permissions: ManagerPermission[]) =>
  SetMetadata(PROPERTY_PERMISSIONS_KEY, permissions);

/**
 * Grants access when the manager holds at least one of the listed permissions.
 * Used where a narrow permission is a legitimate alternative to the broad one,
 * e.g. a rent specialist who may renew without full agreement management.
 */
export const RequireAnyPropertyPermission = (...permissions: ManagerPermission[]) =>
  SetMetadata(PROPERTY_ANY_PERMISSIONS_KEY, permissions);

/**
 * Declares which resource the route param refers to so the permissions guard can
 * resolve the owning property. Defaults to `:propertyId`.
 */
export const PropertyScopedBy = (resource: PropertyScopedResource) =>
  SetMetadata(PROPERTY_SOURCE_KEY, resource);

/**
 * Declares a resource id carried in the request body, for routes that create a
 * resource and therefore have no `:id` param — e.g. an agreement carries `roomId`.
 */
export const PropertyScopedByBody = (resource: PropertyScopedResource, field: string) =>
  applyDecorators(
    SetMetadata(PROPERTY_SOURCE_KEY, resource),
    SetMetadata(PROPERTY_SOURCE_BODY_FIELD_KEY, field),
  );
