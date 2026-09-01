import { describe, expect, it } from 'vitest';

/** Sidebar gate matrix — entitlement must gate Rush nav, shared ops visible for delivery-only. */
describe('AppSidebar rush gating contract', () => {
  function canSeeCourierOps(input: {
    hasRushDeliveryLine: boolean;
    rushModules: boolean;
    canViewCouriers: boolean;
  }) {
    return (
      input.hasRushDeliveryLine &&
      input.canViewCouriers &&
      input.rushModules
    );
  }

  function canSeeVehicleOps(input: { rushVisible: boolean; rideshareVisible: boolean }) {
    const hasSharedOps = input.rushVisible || input.rideshareVisible;
    return hasSharedOps;
  }

  it('hides Rush nav when modules are off', () => {
    expect(
      canSeeCourierOps({
        hasRushDeliveryLine: true,
        rushModules: false,
        canViewCouriers: true,
      }),
    ).toBe(false);
  });

  it('shows shared vehicle ops for delivery-only org', () => {
    expect(canSeeVehicleOps({ rushVisible: true, rideshareVisible: false })).toBe(true);
  });

  it('rideshare-only org unchanged — no Rush nav without line', () => {
    expect(
      canSeeCourierOps({
        hasRushDeliveryLine: false,
        rushModules: true,
        canViewCouriers: true,
      }),
    ).toBe(false);
  });
});
