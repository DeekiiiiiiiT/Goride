import { hasProductAdminAccess, type ProductKey } from './productAdminRoles';

export type JwtUser = {
  user_metadata?: Record<string, unknown>;
  app_metadata?: Record<string, unknown>;
};

function readRolesArray(meta: Record<string, unknown> | undefined): string[] {
  const raw = meta?.roles;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((r): r is string => typeof r === 'string' && r.trim().length > 0)
    .map((r) => r.trim());
}

/**
 * Primary role for authorization: explicit app_metadata.role, else first roles[],
 * else legacy user_metadata.role.
 */
export function jwtPrimaryRole(user: JwtUser): string {
  const appMeta = user.app_metadata;
  const explicit = appMeta?.role;
  if (typeof explicit === 'string' && explicit.trim()) {
    return explicit.trim();
  }

  const fromArray = readRolesArray(appMeta);
  if (fromArray.length > 0) return fromArray[0];

  const um = user.user_metadata?.role;
  if (typeof um === 'string' && um.trim()) return um.trim();
  return '';
}

/** All roles on the JWT for permission checks. */
export function getJwtRoles(user: JwtUser): string[] {
  const fromApp = readRolesArray(user.app_metadata);
  if (fromApp.length > 0) return fromApp;

  const primary = jwtPrimaryRole(user);
  return primary ? [primary] : [];
}

/** True when any JWT role is in the allowed set (use for write gates with multi-role users). */
export function hasAnyJwtRole(user: JwtUser, allowed: ReadonlySet<string> | string[]): boolean {
  const allow = allowed instanceof Set ? allowed : new Set(allowed);
  return getJwtRoles(user).some((r) => allow.has(r));
}

/** True if any JWT role grants access to the product admin portal. */
export function hasProductAdminRole(user: JwtUser, product: ProductKey): boolean {
  const roles = getJwtRoles(user);
  return roles.some((r) => hasProductAdminAccess(r, product));
}

export function userMetadataSurface(user: JwtUser): string | undefined {
  const s = user.user_metadata?.surface;
  return typeof s === 'string' && s.trim() ? s.trim() : undefined;
}

/**
 * Driver app eligibility during migration: profile row, driver role, or surface marker.
 */
export function canUseDriverSurface(user: JwtUser, hasProfile: boolean): boolean {
  if (hasProfile) return true;
  if (getJwtRoles(user).includes('driver')) return true;
  if (userMetadataSurface(user) === 'driver') return true;
  const legacy = user.user_metadata?.role;
  return legacy === 'driver';
}

/**
 * Hauler app eligibility: hauler surface/role, or existing driver profile (dual-role).
 */
export function canUseHaulerSurface(user: JwtUser, hasProfile: boolean): boolean {
  if (hasProfile) return true;
  if (getJwtRoles(user).includes('hauler')) return true;
  if (getJwtRoles(user).includes('driver')) return true;
  const surface = userMetadataSurface(user);
  if (surface === 'hauler' || surface === 'driver') return true;
  const legacy = user.user_metadata?.role;
  return legacy === 'hauler' || legacy === 'driver';
}

/** True when the user holds a non-rides privileged role (admin/fleet/platform). */
export function hasPrivilegedJwtRole(user: JwtUser): boolean {
  const roles = getJwtRoles(user);
  const privileged = new Set([
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
    'courier_admin',
    'courier_ops',
  ]);
  return roles.some((r) => privileged.has(r));
}
