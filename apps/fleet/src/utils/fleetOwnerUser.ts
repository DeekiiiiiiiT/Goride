import type { User } from '@supabase/supabase-js';
import { getJwtRoles } from '@roam/auth-client';

export function isFleetPortalUser(user: User | null | undefined): boolean {
  if (!user) return false;
  const roles = getJwtRoles(user);
  return roles.includes('admin') || roles.includes('fleet_owner');
}

export function needsFleetOwnerProvision(user: User | null | undefined): boolean {
  if (!user) return false;
  // An existing fleet login belongs on the dashboard. Older accounts have no product line
  // in their profile, and that missing line was sending them through "Create your fleet".
  if (isFleetPortalUser(user)) return false;
  return true;
}
