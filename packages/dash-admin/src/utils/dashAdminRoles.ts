import type { User } from '@supabase/supabase-js';
import { hasAnyJwtRole } from '@roam/auth-client';

const JWT_WRITE_FALLBACK = new Set(['dash_admin', 'platform_owner', 'superadmin']);
const JWT_DELETE_FALLBACK = new Set(['platform_owner', 'superadmin', 'dash_admin']);
const JWT_FORCE_APPROVE_FALLBACK = new Set(['platform_owner', 'superadmin', 'dash_admin']);

function checkPermission(
  permissions: string[] | undefined,
  key: string,
): boolean {
  return permissions?.includes(key) ?? false;
}

export function canWriteDashAdmin(
  user: User | { app_metadata?: Record<string, unknown>; user_metadata?: Record<string, unknown> },
  permissions?: string[],
): boolean {
  if (
    checkPermission(permissions, 'dash.users.write')
    || checkPermission(permissions, 'system.config')
  ) {
    return true;
  }
  return hasAnyJwtRole(user, JWT_WRITE_FALLBACK);
}

export function canForceApproveMerchant(
  user: User | { app_metadata?: Record<string, unknown>; user_metadata?: Record<string, unknown> },
  permissions?: string[],
): boolean {
  if (
    checkPermission(permissions, 'dash.compliance.approve')
    || checkPermission(permissions, 'system.config')
  ) {
    return true;
  }
  return hasAnyJwtRole(user, JWT_FORCE_APPROVE_FALLBACK);
}

export function canDeleteDashAdmin(
  user: User | { app_metadata?: Record<string, unknown>; user_metadata?: Record<string, unknown> },
  permissions?: string[],
): boolean {
  if (
    checkPermission(permissions, 'dash.users.write')
    || checkPermission(permissions, 'users.delete')
    || checkPermission(permissions, 'identity.delete')
  ) {
    return true;
  }
  return hasAnyJwtRole(user, JWT_DELETE_FALLBACK);
}
