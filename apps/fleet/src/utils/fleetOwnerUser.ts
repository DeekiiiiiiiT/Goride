import type { User } from '@supabase/supabase-js';
import { getJwtRoles } from '@roam/auth-client';

export function isFleetPortalUser(user: User | null | undefined): boolean {
  if (!user) return false;
  const roles = getJwtRoles(user);
  if (roles.includes('admin') || roles.includes('fleet_owner')) return true;
  const legacy = user.user_metadata?.role;
  return legacy === 'admin' || legacy === 'fleet_owner';
}

export function needsFleetOwnerProvision(user: User | null | undefined): boolean {
  if (!user) return false;
  const meta = user.user_metadata || {};
  const orgId = meta.organizationId as string | undefined;
  const pl = meta.productLine as string | undefined;
  if (!isFleetPortalUser(user)) return true;
  if (pl && pl !== 'fleet') return true;
  if (!pl) return true;
  if (meta.businessType && meta.businessType !== 'rideshare') return true;
  // Legacy fleet owners created before the split often have no organizationId in metadata;
  // AuthContext treats admin org as user.id — do not force them through signup again.
  if (!orgId) {
    const legacyOwner =
      meta.role === 'admin' ||
      meta.role === 'fleet_owner' ||
      getJwtRoles(user).includes('admin') ||
      getJwtRoles(user).includes('fleet_owner');
    if (legacyOwner) return false;
    return true;
  }
  return false;
}
