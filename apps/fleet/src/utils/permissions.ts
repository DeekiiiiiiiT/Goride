/**
 * Fleet RBAC — re-export canonical catalog from @roam/auth-client.
 */
export {
  type Role,
  type LegacyRole,
  type AnyRole,
  type RoleTier,
  type RoleMeta,
  ROLE_META,
  type Permission,
  ROLE_PERMISSIONS,
  VALID_ROLES,
  isAssignableRole,
  resolveRole,
  hasPermission,
  getPermissions,
  getRoleLevel,
  canManageRole,
  PAGE_PERMISSION_MAP,
  canViewPage,
} from '@roam/auth-client';
