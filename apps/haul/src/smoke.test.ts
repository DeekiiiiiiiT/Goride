import { describe, expect, it } from 'vitest';
import { hasProductAdminRole, isHaulUiBlockedRole } from '@roam/auth-client';
import { HAUL_DISPATCH_CONFIG } from '@roam/hauler-dispatch';

describe('haul app smoke', () => {
  it('haul dispatch config accepts haulage offers only', () => {
    const haulOffer = {
      id: '1',
      ride: { vehicle_option: 'haulage' },
    } as Parameters<typeof HAUL_DISPATCH_CONFIG.filterOffer>[0];
    const rideOffer = {
      id: '2',
      ride: { vehicle_option: 'uberx' },
    } as Parameters<typeof HAUL_DISPATCH_CONFIG.filterOffer>[0];
    expect(HAUL_DISPATCH_CONFIG.filterOffer(haulOffer)).toBe(true);
    expect(HAUL_DISPATCH_CONFIG.filterOffer(rideOffer)).toBe(false);
    expect(HAUL_DISPATCH_CONFIG.dispatchMode).toBe('haulage');
  });

  it('blocks non-hauler roles from haul consumer UI', () => {
    expect(isHaulUiBlockedRole('rides_admin')).toBe(true);
    expect(isHaulUiBlockedRole('haul_admin')).toBe(true);
    expect(isHaulUiBlockedRole('hauler')).toBe(false);
    expect(isHaulUiBlockedRole('driver')).toBe(false);
  });

  it('allows haul_admin on haul admin portal', () => {
    const user = {
      app_metadata: { roles: ['haul_admin'] },
      user_metadata: {},
    } as Parameters<typeof hasProductAdminRole>[0];
    expect(hasProductAdminRole(user, 'haul')).toBe(true);
    expect(hasProductAdminRole(user, 'rides')).toBe(false);
  });
});
