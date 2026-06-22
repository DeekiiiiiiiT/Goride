import type { User } from '@supabase/supabase-js';
import { hasAnyJwtRole } from '@roam/auth-client';

export const COURIER_WRITE_ROLES = new Set([
  'courier_admin',
  'platform_owner',
  'platform_support',
  'superadmin',
]);

export const COURIER_FORCE_APPROVE_ROLES = new Set([
  'platform_owner',
  'superadmin',
  'courier_admin',
]);

export const COURIER_DELETE_ROLES = new Set([
  'courier_admin',
  'platform_owner',
  'superadmin',
]);

export function canWriteCourierAdmin(
  user: User | { app_metadata?: Record<string, unknown>; user_metadata?: Record<string, unknown> },
): boolean {
  return hasAnyJwtRole(user, COURIER_WRITE_ROLES);
}

export function canForceApproveCourier(
  user: User | { app_metadata?: Record<string, unknown>; user_metadata?: Record<string, unknown> },
): boolean {
  return hasAnyJwtRole(user, COURIER_FORCE_APPROVE_ROLES);
}

export function canDeleteCourier(
  user: User | { app_metadata?: Record<string, unknown>; user_metadata?: Record<string, unknown> },
): boolean {
  return hasAnyJwtRole(user, COURIER_DELETE_ROLES);
}
