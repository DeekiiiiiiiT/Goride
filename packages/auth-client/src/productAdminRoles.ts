/**
 * Product-scoped admin roles — shared by client and edge guards.
 */
export type ProductKey = 'fleet' | 'enterprise' | 'dash' | 'rides' | 'driver';

/** Platform roles that have access to all product admins */
export const PLATFORM_ROLES = new Set([
  'platform_owner',
  'platform_support',
  'superadmin',
]);

/** Product-specific admin roles */
export const PRODUCT_ADMIN_ROLES: Record<ProductKey, Set<string>> = {
  fleet: new Set([...PLATFORM_ROLES, 'fleet_admin', 'fleet_ops']),
  enterprise: new Set([...PLATFORM_ROLES, 'enterprise_admin', 'enterprise_ops']),
  dash: new Set([...PLATFORM_ROLES, 'dash_admin', 'dash_ops']),
  rides: new Set([...PLATFORM_ROLES, 'rides_admin', 'rides_ops']),
  driver: new Set([...PLATFORM_ROLES, 'driver_admin', 'driver_ops']),
};

export function hasProductAdminAccess(
  role: string | null | undefined,
  product: ProductKey,
): boolean {
  if (!role) return false;
  return PRODUCT_ADMIN_ROLES[product].has(role);
}

export function isPlatformRole(role: string | null | undefined): boolean {
  if (!role) return false;
  return PLATFORM_ROLES.has(role);
}
