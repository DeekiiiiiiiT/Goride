import type { User } from '@supabase/supabase-js';
import { getJwtRoles, jwtPrimaryRole } from '@roam/auth-client';

export function isFleetPortalUser(user: User | null | undefined): boolean {
  if (!user) return false;
  const roles = getJwtRoles(user);
  return roles.includes('admin') || roles.includes('fleet_owner');
}

export function needsFleetOwnerProvision(user: User | null | undefined): boolean {
  if (!user) return false;
  const appMeta = user.app_metadata || {};
  const meta = user.user_metadata || {};
  const orgId =
    (typeof appMeta.organizationId === 'string' && appMeta.organizationId) ||
    (typeof meta.organizationId === 'string' && meta.organizationId) ||
    undefined;
  const pl = meta.productLine as string | undefined;
  if (!isFleetPortalUser(user)) return true;
  if (pl && pl !== 'fleet') return true;
  if (!pl) return true;
  if (meta.businessType && meta.businessType !== 'rideshare') return true;
  // Legacy fleet owners: org may be self-id via app_metadata role without explicit orgId
  if (!orgId) {
    const primary = jwtPrimaryRole(user);
    const legacyOwner =
      primary === 'admin' ||
      primary === 'fleet_owner' ||
      getJwtRoles(user).includes('admin') ||
      getJwtRoles(user).includes('fleet_owner');
    if (legacyOwner) return false;
    return true;
  }
  return false;
}
