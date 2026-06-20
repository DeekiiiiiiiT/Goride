/**
 * Enterprise platform permission keys — shared by client and edge.
 * Fleet customer permissions remain in permissions.ts (nav.*, fuel.*, etc.).
 */
export const PLATFORM_PERMISSIONS = {
  USERS_READ: 'users.read',
  USERS_CREATE: 'users.create',
  USERS_EDIT: 'users.edit',
  USERS_DELETE: 'users.delete',
  USERS_MANAGE_ROLES: 'users.manage_roles',
  USERS_SUSPEND: 'users.suspend',
  USERS_BAN: 'users.ban',

  FINANCIAL_READ: 'financial.read',
  FINANCIAL_EDIT: 'financial.edit',
  FINANCIAL_REFUNDS: 'financial.refunds',
  FINANCIAL_SETTLEMENTS: 'financial.settlements',

  SYSTEM_CONFIG: 'system.config',
  SYSTEM_BILLING: 'system.billing',
  SYSTEM_SECURITY: 'system.security',

  ANALYTICS_VIEW: 'analytics.view',
  ANALYTICS_EXPORT: 'analytics.export',

  ROLES_MANAGE: 'roles.manage',
  AUDIT_READ: 'audit.read',
} as const;

export type PlatformPermissionKey =
  (typeof PLATFORM_PERMISSIONS)[keyof typeof PLATFORM_PERMISSIONS];

export type ProductKey =
  | 'fleet'
  | 'enterprise'
  | 'dash'
  | 'rides'
  | 'driver'
  | 'haul'
  | 'courier';

export type ProductPermissionSuffix =
  | 'portal.access'
  | 'users.read'
  | 'users.write'
  | 'compliance.read'
  | 'compliance.approve'
  | 'ledger.read'
  | 'support.write'
  | 'settings.read'
  | 'settings.write'
  | 'presence.read';

export type ProductPermissionKey = `${ProductKey}.${ProductPermissionSuffix}`;

export type PermissionKey = PlatformPermissionKey | ProductPermissionKey;

export function productPermission(
  product: ProductKey,
  suffix: ProductPermissionSuffix,
): ProductPermissionKey {
  return `${product}.${suffix}`;
}

export function productPortalAccess(product: ProductKey): ProductPermissionKey {
  return productPermission(product, 'portal.access');
}

/** All known platform permission keys (for validation). */
export const ALL_PLATFORM_PERMISSION_KEYS: readonly PlatformPermissionKey[] =
  Object.values(PLATFORM_PERMISSIONS);
