import type { PermissionKey, ProductKey } from './platformPermissions';

/** Numeric hierarchy for role comparison. Higher = more privileged. */
export const ROLE_LEVELS = {
  PLATFORM_OWNER: 1000,
  PLATFORM_SUPPORT: 950,
  PRODUCT_ADMIN: 800,
  PRODUCT_OPS: 700,
  PLATFORM_ANALYST: 500,
} as const;

export type RoleLevel = (typeof ROLE_LEVELS)[keyof typeof ROLE_LEVELS];

export interface DbRoleMeta {
  name: string;
  displayName: string;
  level: RoleLevel;
  productKey: ProductKey | null;
}

/** Minimum level required to access Dominion (super admin) portal. */
export const PLATFORM_PORTAL_MIN_LEVEL = ROLE_LEVELS.PLATFORM_SUPPORT;

/** Minimum level for product admin write actions. */
export const PRODUCT_WRITE_MIN_LEVEL = ROLE_LEVELS.PRODUCT_ADMIN;

export interface UserPermissionContext {
  userId: string;
  permissions: PermissionKey[];
  roleLevel: number;
  isPlatformUser: boolean;
  roleNames: string[];
}
