import type { User } from '@supabase/supabase-js';
import { hasAnyJwtRole } from '@roam/auth-client';

export const DRIVER_WRITE_ROLES = new Set([
  'driver_admin',
  'platform_owner',
  'platform_support',
  'superadmin',
]);

export const DRIVER_FORCE_APPROVE_ROLES = new Set([
  'platform_owner',
  'platform_support',
  'superadmin',
  'admin',
  'driver_admin',
]);

export function canWriteDriverAdmin(user: User | { app_metadata?: Record<string, unknown>; user_metadata?: Record<string, unknown> }): boolean {
  return hasAnyJwtRole(user, DRIVER_WRITE_ROLES);
}

export function canForceApproveDriver(user: User | { app_metadata?: Record<string, unknown>; user_metadata?: Record<string, unknown> }): boolean {
  return hasAnyJwtRole(user, DRIVER_FORCE_APPROVE_ROLES);
}

export const DRIVER_DELETE_ROLES = new Set([
  'driver_admin',
  'platform_owner',
  'superadmin',
]);

export function canDeleteDriverAdmin(
  user: User | { app_metadata?: Record<string, unknown>; user_metadata?: Record<string, unknown> },
): boolean {
  return hasAnyJwtRole(user, DRIVER_DELETE_ROLES);
}
