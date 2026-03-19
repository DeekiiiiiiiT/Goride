/**
 * usePermissions — React hook for RBAC permission checks.
 *
 * Wraps the pure helpers from /utils/permissions.ts and reads the resolved
 * role from AuthContext.  Any component can call this to decide what to
 * show / hide / disable.
 *
 * Created: Phase 2 of the RBAC rollout (see /solution.md).
 */

import { useAuth } from '../components/auth/AuthContext';
import {
  hasPermission,
  getPermissions,
  getRoleLevel,
  canViewPage,
  type Permission,
  type Role,
} from '../utils/permissions';

export interface UsePermissionsReturn {
  /** The resolved canonical role, or null if not logged in. */
  role: Role | null;

  /** The organization ID of the current user, or null. */
  organizationId: string | null;

  /** Check a single permission. Returns false if not logged in. */
  can: (permission: Permission) => boolean;

  /** True if the user has ANY of the listed permissions. */
  canAny: (...permissions: Permission[]) => boolean;

  /** True if the user has ALL of the listed permissions. */
  canAll: (...permissions: Permission[]) => boolean;

  /**
   * Check whether the user may see a sidebar page.
   * Uses PAGE_PERMISSION_MAP internally.  Pages not in the map default to visible.
   */
  canView: (pageId: string) => boolean;

  /** Level-based comparison: true if user's role level >= minimumRole's level. */
  isAtLeast: (minimumRole: Role) => boolean;

  /** Full list of the user's permissions. */
  permissions: readonly Permission[];
}

export function usePermissions(): UsePermissionsReturn {
  const { resolvedRole, organizationId } = useAuth();

  const role = resolvedRole ?? null;

  const can = (permission: Permission): boolean => {
    if (!role) return false;
    return hasPermission(role, permission);
  };

  const canAny = (...permissions: Permission[]): boolean => {
    if (!role) return false;
    return permissions.some((p) => hasPermission(role, p));
  };

  const canAll = (...permissions: Permission[]): boolean => {
    if (!role) return false;
    return permissions.every((p) => hasPermission(role, p));
  };

  const canView = (pageId: string): boolean => {
    if (!role) return false;
    return canViewPage(role, pageId);
  };

  const isAtLeast = (minimumRole: Role): boolean => {
    if (!role) return false;
    return getRoleLevel(role) >= getRoleLevel(minimumRole);
  };

  const permissions = role ? getPermissions(role) : ([] as const);

  return { role, organizationId, can, canAny, canAll, canView, isAtLeast, permissions };
}