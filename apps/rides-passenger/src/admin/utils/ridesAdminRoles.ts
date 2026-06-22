import type { User } from '@supabase/supabase-js';
import { hasAnyJwtRole } from '@roam/auth-client';

export const RIDES_WRITE_ROLES = new Set([
  'rides_admin',
  'platform_owner',
  'platform_support',
  'superadmin',
]);

export const RIDES_DELETE_ROLES = new Set([
  'rides_admin',
  'platform_owner',
  'superadmin',
]);

export function canWriteRidesAdmin(
  user: User | { app_metadata?: Record<string, unknown>; user_metadata?: Record<string, unknown> },
): boolean {
  return hasAnyJwtRole(user, RIDES_WRITE_ROLES);
}

export function canDeleteRidesAdmin(
  user: User | { app_metadata?: Record<string, unknown>; user_metadata?: Record<string, unknown> },
): boolean {
  return hasAnyJwtRole(user, RIDES_DELETE_ROLES);
}
