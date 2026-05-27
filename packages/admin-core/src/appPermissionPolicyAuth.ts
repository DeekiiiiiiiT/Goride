import { hasAnyJwtRole, type JwtUser } from '@roam/auth-client';

/** Roles that may PATCH rider app permission policy (matches rides Edge guard). */
export const RIDER_APP_PERMISSION_WRITE_ROLES = new Set([
  'platform_owner',
  'superadmin',
  'rides_admin',
]);

/** Roles that may PATCH driver app permission policy (matches rides Edge guard). */
export const DRIVER_APP_PERMISSION_WRITE_ROLES = new Set([
  'platform_owner',
  'superadmin',
  'driver_admin',
]);

export function canWriteAppPermissionPolicy(
  user: JwtUser,
  surface: 'rider' | 'driver',
): boolean {
  const allowed =
    surface === 'driver' ? DRIVER_APP_PERMISSION_WRITE_ROLES : RIDER_APP_PERMISSION_WRITE_ROLES;
  return hasAnyJwtRole(user, allowed);
}
