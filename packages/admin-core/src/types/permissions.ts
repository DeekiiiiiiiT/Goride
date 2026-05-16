/**
 * Product Admin Roles and Permissions
 * 
 * Extends the base RBAC system with product-scoped admin roles.
 */

/** Platform-level roles that can access all product admins */
export const PLATFORM_ROLES = [
  'platform_owner',
  'platform_support',
  'superadmin',
] as const;

/** Product-scoped admin roles */
export type ProductAdminRole =
  | 'dash_admin'      // Full Dash admin access
  | 'dash_ops'        // Dash operations (merchants, orders)
  | 'rides_admin'     // Full Rides admin access
  | 'rides_ops'       // Rides operations (fare, surge)
  | 'driver_admin'    // Full Driver admin access
  | 'driver_ops';     // Driver operations (compliance, support)

/** All roles that can access product admin portals */
export type AdminRole = typeof PLATFORM_ROLES[number] | ProductAdminRole;

/** Product admin access matrix - which roles can access which product admin */
export const PRODUCT_ADMIN_ACCESS = {
  platform: [...PLATFORM_ROLES],
  dash: [...PLATFORM_ROLES, 'dash_admin', 'dash_ops'],
  rides: [...PLATFORM_ROLES, 'rides_admin', 'rides_ops'],
  driver: [...PLATFORM_ROLES, 'driver_admin', 'driver_ops'],
} as const;

export type ProductKey = keyof typeof PRODUCT_ADMIN_ACCESS;

/**
 * Check if a role has access to a product admin portal
 */
export function hasProductAdminAccess(
  role: string | null | undefined,
  product: ProductKey
): boolean {
  if (!role) return false;
  const allowedRoles = PRODUCT_ADMIN_ACCESS[product];
  return (allowedRoles as readonly string[]).includes(role);
}

/**
 * Check if a role is a platform-level role
 */
export function isPlatformRole(role: string | null | undefined): boolean {
  if (!role) return false;
  return (PLATFORM_ROLES as readonly string[]).includes(role);
}

/**
 * Get all products a role can access
 */
export function getAccessibleProducts(role: string | null | undefined): ProductKey[] {
  if (!role) return [];
  
  const products: ProductKey[] = [];
  for (const [product, roles] of Object.entries(PRODUCT_ADMIN_ACCESS)) {
    if ((roles as readonly string[]).includes(role)) {
      products.push(product as ProductKey);
    }
  }
  return products;
}

/**
 * Role metadata for product admin roles
 */
export const PRODUCT_ROLE_META: Record<ProductAdminRole, { label: string; description: string }> = {
  dash_admin: {
    label: 'Dash Admin',
    description: 'Full access to Roam Dash admin - merchants, orders, payouts',
  },
  dash_ops: {
    label: 'Dash Operations',
    description: 'Manage merchants and orders in Roam Dash',
  },
  rides_admin: {
    label: 'Rides Admin',
    description: 'Full access to Roam Rides admin - fares, surge, ride ops',
  },
  rides_ops: {
    label: 'Rides Operations',
    description: 'Manage fare rules and surge pricing',
  },
  driver_admin: {
    label: 'Driver Admin',
    description: 'Full access to Driver admin - compliance, support',
  },
  driver_ops: {
    label: 'Driver Operations',
    description: 'Manage driver compliance and support tools',
  },
};
