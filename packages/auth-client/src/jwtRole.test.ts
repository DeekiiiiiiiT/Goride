import { describe, expect, it } from 'vitest';
import {
  canUseDriverSurface,
  canUseHaulerSurface,
  getJwtRoles,
  hasAnyJwtRole,
  hasProductAdminRole,
  jwtPrimaryRole,
} from './jwtRole';
import { shouldSkipOauthSurfaceWrite } from './oauthRoleGuard';

describe('jwtPrimaryRole', () => {
  it('prefers app_metadata.role over user_metadata.role', () => {
    const user = {
      app_metadata: { role: 'driver_admin' },
      user_metadata: { role: 'driver' },
    };
    expect(jwtPrimaryRole(user)).toBe('driver_admin');
  });

  it('uses app_metadata.roles when role is absent', () => {
    const user = {
      app_metadata: { roles: ['driver_admin', 'driver'] },
      user_metadata: { role: 'driver' },
    };
    expect(jwtPrimaryRole(user)).toBe('driver_admin');
    expect(getJwtRoles(user)).toEqual(['driver_admin', 'driver']);
  });

  it('does not fall back to user_metadata.role', () => {
    const user = { user_metadata: { role: 'driver' } };
    expect(jwtPrimaryRole(user)).toBe('');
  });
});

describe('hasAnyJwtRole', () => {
  it('matches a secondary role when primary is different', () => {
    const user = {
      app_metadata: { roles: ['rides_admin', 'driver_admin'] },
    };
    expect(hasAnyJwtRole(user, ['driver_admin'])).toBe(true);
    expect(hasAnyJwtRole(user, ['fleet_admin'])).toBe(false);
  });
});

describe('hasProductAdminRole', () => {
  it('grants driver admin when role is only in app_metadata', () => {
    const user = {
      app_metadata: { role: 'driver_admin' },
      user_metadata: { role: 'driver' },
    };
    expect(hasProductAdminRole(user, 'driver')).toBe(true);
  });

  it('denies pure driver accounts', () => {
    const user = { user_metadata: { role: 'driver' } };
    expect(hasProductAdminRole(user, 'driver')).toBe(false);
  });

  it('grants haul admin when role is in app_metadata', () => {
    const user = { app_metadata: { role: 'haul_admin' } };
    expect(hasProductAdminRole(user, 'haul')).toBe(true);
  });
});

describe('canUseDriverSurface', () => {
  it('allows profile without metadata', () => {
    expect(canUseDriverSurface({}, true)).toBe(true);
  });

  it('denies legacy user_metadata driver role without profile', () => {
    expect(canUseDriverSurface({ user_metadata: { role: 'driver' } }, false)).toBe(false);
  });

  it('allows app_metadata driver role', () => {
    expect(canUseDriverSurface({ app_metadata: { roles: ['driver'] } }, false)).toBe(true);
  });
});

describe('canUseHaulerSurface', () => {
  it('denies hauler surface alone without profile', () => {
    expect(canUseHaulerSurface({ user_metadata: { surface: 'hauler' } }, false)).toBe(false);
  });

  it('allows driver profile for dual-role', () => {
    expect(canUseHaulerSurface({ user_metadata: { role: 'driver' } }, true)).toBe(true);
  });
});

describe('shouldSkipOauthSurfaceWrite', () => {
  it('skips when user has driver_admin in app_metadata', () => {
    const user = {
      app_metadata: { role: 'driver_admin' },
      user_metadata: { role: 'driver' },
    };
    expect(shouldSkipOauthSurfaceWrite(user, 'driver')).toBe(true);
  });
});
