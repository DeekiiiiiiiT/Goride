/**
 * Rules for OAuth / surface metadata on rider/driver apps.
 * Permissions live in app_metadata; user_metadata.surface is UX-only.
 */

import { getJwtRoles, hasPrivilegedJwtRole, jwtPrimaryRole, userMetadataSurface, type JwtUser } from './jwtRole';

export const RIDES_SURFACE_ROLES = new Set(['passenger', 'driver']);

export const HAUL_SURFACE_ROLES = new Set(['hauler', 'driver']);

export type RidesSurface = 'passenger' | 'driver';

export type HaulSurface = 'hauler';

export type AppSurface = RidesSurface | HaulSurface;

/** Roles that must not be replaced by client surface writes (fleet + platform + product admin). */
export const PRIVILEGED_METADATA_ROLES = new Set([
  'platform_owner',
  'platform_support',
  'platform_analyst',
  'fleet_owner',
  'fleet_manager',
  'fleet_accountant',
  'fleet_viewer',
  'superadmin',
  'admin',
  'manager',
  'viewer',
  'dash_admin',
  'dash_ops',
  'rides_admin',
  'rides_ops',
  'driver_admin',
  'driver_ops',
  'haul_admin',
  'haul_ops',
]);

/**
 * @deprecated Use shouldSkipOauthSurfaceWrite with full user — checks legacy role string only.
 */
export function shouldSkipOauthSurfaceRolePatch(
  current: string | null | undefined,
  intended: RidesSurface,
): boolean {
  const r = (current ?? '').trim();
  if (!r) return false;
  if (r === intended) return true;
  if (PRIVILEGED_METADATA_ROLES.has(r)) return true;
  if (RIDES_SURFACE_ROLES.has(r)) return false;
  return true;
}

/** Skip writing user_metadata.surface when user has admin/fleet roles or surface already set. */
export function shouldSkipOauthSurfaceWrite(user: JwtUser, intended: AppSurface): boolean {
  if (hasPrivilegedJwtRole(user)) return true;
  const surface = userMetadataSurface(user);
  if (surface === intended) return true;
  const primary = jwtPrimaryRole(user);
  if (primary && PRIVILEGED_METADATA_ROLES.has(primary)) return true;
  return false;
}

export function isPassengerOnlyMetadataRole(raw: string | null | undefined): boolean {
  return (raw ?? '').trim() === 'passenger';
}

/**
 * @deprecated Surface auto-patch on login removed; kept for callers migrating off role patches.
 */
export function needsRidesSurfaceRolePatch(
  current: string | null | undefined,
  intended: RidesSurface,
): boolean {
  const r = (current ?? '').trim();
  if (!r) return true;
  if (r === intended) return false;
  if (shouldSkipOauthSurfaceRolePatch(current, intended)) return false;
  return true;
}

/** Block Roam Rides passenger UI when JWT roles are not passenger/driver surface roles. */
export function isRidesPassengerUiBlockedRole(
  rawOrUser: string | null | undefined | JwtUser,
): boolean {
  if (rawOrUser && typeof rawOrUser === 'object') {
    const user = rawOrUser as JwtUser;
    if (hasPrivilegedJwtRole(user)) return true;
    const roles = getJwtRoles(user);
    if (roles.length > 0) {
      return roles.some((r) => !RIDES_SURFACE_ROLES.has(r));
    }
    const surface = userMetadataSurface(user);
    if (surface === 'passenger') return false;
    if (surface === 'driver') return true;
    const legacy = user.user_metadata?.role;
    if (!legacy || typeof legacy !== 'string') return false;
    return !RIDES_SURFACE_ROLES.has(legacy.trim());
  }

  const r = (rawOrUser ?? '').trim();
  if (!r) return false;
  return !RIDES_SURFACE_ROLES.has(r);
}

/** Block Roam Haul consumer UI when JWT roles are privileged or not hauler-eligible. */
export function isHaulUiBlockedRole(rawOrUser: string | null | undefined | JwtUser): boolean {
  if (rawOrUser && typeof rawOrUser === 'object') {
    const user = rawOrUser as JwtUser;
    if (hasPrivilegedJwtRole(user)) return true;
    const roles = getJwtRoles(user);
    if (roles.includes('hauler')) return false;
    const surface = userMetadataSurface(user);
    if (surface === 'hauler') return false;
    if (surface === 'driver' || roles.includes('driver')) return false;
    if (roles.length > 0) {
      return !roles.some((r) => HAUL_SURFACE_ROLES.has(r));
    }
    const legacy = user.user_metadata?.role;
    if (!legacy || typeof legacy !== 'string') return false;
    return !HAUL_SURFACE_ROLES.has(legacy.trim());
  }

  const r = (rawOrUser ?? '').trim();
  if (!r) return false;
  return !HAUL_SURFACE_ROLES.has(r);
}
