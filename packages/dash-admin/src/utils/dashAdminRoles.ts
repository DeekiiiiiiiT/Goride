import type { User } from '@supabase/supabase-js';
import { hasAnyJwtRole } from '@roam/auth-client';

export const DASH_WRITE_ROLES = new Set([
  'dash_admin',
  'platform_owner',
  'platform_support',
  'superadmin',
]);

export const DASH_FORCE_APPROVE_ROLES = new Set([
  'platform_owner',
  'superadmin',
  'dash_admin',
]);

export const DASH_DELETE_ROLES = new Set([
  'platform_owner',
  'superadmin',
  'dash_admin',
]);

export function canWriteDashAdmin(
  user: User | { app_metadata?: Record<string, unknown>; user_metadata?: Record<string, unknown> },
): boolean {
  return hasAnyJwtRole(user, DASH_WRITE_ROLES);
}

export function canForceApproveMerchant(
  user: User | { app_metadata?: Record<string, unknown>; user_metadata?: Record<string, unknown> },
): boolean {
  return hasAnyJwtRole(user, DASH_FORCE_APPROVE_ROLES);
}

export function canDeleteDashAdmin(
  user: User | { app_metadata?: Record<string, unknown>; user_metadata?: Record<string, unknown> },
): boolean {
  return hasAnyJwtRole(user, DASH_DELETE_ROLES);
}
