import { describe, expect, it } from 'vitest';
import { ROLE_PERMISSIONS, type Role } from '../../../auth-client/src/permissions.ts';

const EXPECTED = ['fleet_manager', 'fleet_owner', 'platform_owner'];

describe('toll.manage role drift', () => {
  it('matches the SQL mirror in toll_system.user_can_manage_tolls', () => {
    const roles = (Object.keys(ROLE_PERMISSIONS) as Role[])
      .filter((role) => ROLE_PERMISSIONS[role].includes('toll.manage'))
      .sort();
    expect(
      roles,
      'toll.manage roles changed — update toll_system.user_can_manage_tolls in a new migration.',
    ).toEqual(EXPECTED);
  });
});
