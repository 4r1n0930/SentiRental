/**
 * Guard execution order. JwtAuthGuard must run before RolesGuard and
 * PropertyPermissionsGuard because they read `request.user`.
 */
export const APP_GUARD_ORDER = {
  throttle: 0,
  jwt: 1,
  roles: 2,
  propertyPermissions: 3,
} as const;
