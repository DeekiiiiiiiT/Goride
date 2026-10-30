import { dominionCan } from '@roam/auth-client/dominionPermissions';
import { getJwtRoles, type JwtUser } from '@roam/auth-client/jwtRole';

/** Same rule as the server: dominionCan(role, 'maps.publish') on any app role. */
export function canPublishMaps(user: JwtUser | null | undefined): boolean {
  return getJwtRoles(user ?? {}).some((role) => dominionCan(role, 'maps.publish'));
}
