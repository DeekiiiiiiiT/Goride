/**
 * Rules for applying `user_metadata.role` after Google OAuth from rider/driver apps.
 * Fleet / platform roles must never be overwritten by passenger/driver signup intents.
 */

export const RIDES_SURFACE_ROLES = new Set(['passenger', 'driver']);

/** Roles that must not be replaced by OAuth surface patch (fleet + platform + legacy aliases). */
export const PRIVILEGED_METADATA_ROLES = new Set([
  'platform_owner',
  'platform_support',
  'platform_analyst',
  'fleet_owner',
  'fleet_manager',
  'fleet_accountant',
  'fleet_viewer',
  'superadmin',
  'admin',
  'manager',
  'viewer',
]);

/**
 * If true, skip `updateUser({ data: { role: intended } })` for OAuth completion.
 * - Always skip when already `intended`.
 * - Skip for privileged fleet/platform roles.
 * - Skip for unknown non-rides strings (do not clobber custom metadata).
 * - Allow empty → intended, and passenger ↔ driver switches.
 */
export function shouldSkipOauthSurfaceRolePatch(
  current: string | null | undefined,
  intended: 'passenger' | 'driver'
): boolean {
  const r = (current ?? '').trim();
  if (!r) return false;
  if (r === intended) return true;
  if (PRIVILEGED_METADATA_ROLES.has(r)) return true;
  if (RIDES_SURFACE_ROLES.has(r)) return false;
  return true;
}

export function isPassengerOnlyMetadataRole(raw: string | null | undefined): boolean {
  return (raw ?? '').trim() === 'passenger';
}

/** True when this metadata role must not use Roam Rides passenger shell (only passenger/driver allowed). */
export function isRidesPassengerUiBlockedRole(raw: string | null | undefined): boolean {
  const r = (raw ?? '').trim();
  if (!r) return false;
  return !RIDES_SURFACE_ROLES.has(r);
}
