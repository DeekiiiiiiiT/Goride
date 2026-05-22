import { describe, expect, it } from 'vitest';
import {
  canUseDriverSurface,
  getJwtRoles,
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

  it('falls back to user_metadata.role', () => {
    const user = { user_metadata: { role: 'driver' } };
    expect(jwtPrimaryRole(user)).toBe('driver');
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
});

describe('canUseDriverSurface', () => {
  it('allows profile without metadata', () => {
    expect(canUseDriverSurface({}, true)).toBe(true);
  });

  it('allows legacy driver role', () => {
    expect(canUseDriverSurface({ user_metadata: { role: 'driver' } }, false)).toBe(true);
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
