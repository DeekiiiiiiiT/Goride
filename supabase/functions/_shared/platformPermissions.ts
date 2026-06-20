/**
 * Enterprise platform permission keys — Deno edge mirror of platformPermissions.ts
 */
export const PLATFORM_PERMISSIONS = {
  USERS_READ: "users.read",
  USERS_CREATE: "users.create",
  USERS_EDIT: "users.edit",
  USERS_DELETE: "users.delete",
  USERS_MANAGE_ROLES: "users.manage_roles",
  USERS_SUSPEND: "users.suspend",
  USERS_BAN: "users.ban",

  FINANCIAL_READ: "financial.read",
  FINANCIAL_EDIT: "financial.edit",
  FINANCIAL_REFUNDS: "financial.refunds",
  FINANCIAL_SETTLEMENTS: "financial.settlements",

  SYSTEM_CONFIG: "system.config",
  SYSTEM_BILLING: "system.billing",
  SYSTEM_SECURITY: "system.security",

  ANALYTICS_VIEW: "analytics.view",
  ANALYTICS_EXPORT: "analytics.export",

  ROLES_MANAGE: "roles.manage",
  AUDIT_READ: "audit.read",
} as const;

export type ProductKey =
  | "fleet"
  | "enterprise"
  | "dash"
  | "rides"
  | "driver"
  | "haul"
  | "courier";

export type ProductPermissionSuffix =
  | "portal.access"
  | "users.read"
  | "users.write"
  | "compliance.read"
  | "compliance.approve"
  | "ledger.read"
  | "support.write"
  | "settings.read"
  | "settings.write"
  | "presence.read";

export function productPermission(
  product: ProductKey,
  suffix: ProductPermissionSuffix,
): string {
  return `${product}.${suffix}`;
}

export function productPortalAccess(product: ProductKey): string {
  return productPermission(product, "portal.access");
}

export const ROLE_LEVELS = {
  PLATFORM_OWNER: 1000,
  PLATFORM_SUPPORT: 950,
  PRODUCT_ADMIN: 800,
  PRODUCT_OPS: 700,
  PLATFORM_ANALYST: 500,
} as const;

export type RoleLevel = (typeof ROLE_LEVELS)[keyof typeof ROLE_LEVELS];

export const PLATFORM_PORTAL_MIN_LEVEL = ROLE_LEVELS.PLATFORM_SUPPORT;
