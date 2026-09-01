import { describe, expect, it } from 'vitest';
import {
  canSeeCourierOps,
  canSeeEarningsPolicy,
  hasSharedOps,
  rushModuleNavEnabled,
} from '../../layout/sidebarGating';

describe('sidebarGating', () => {
  it('hides Rush nav when modules are off', () => {
    expect(
      canSeeCourierOps({
        hasRushDeliveryLine: true,
        rushModuleEnabled: false,
        canViewAnyCourierPage: true,
      }),
    ).toBe(false);
  });

  it('shows shared vehicle ops for delivery-only org', () => {
    expect(hasSharedOps({ rushVisible: true, rideshareVisible: false })).toBe(true);
  });

  it('rideshare-only org unchanged — no Rush nav without line', () => {
    expect(
      canSeeCourierOps({
        hasRushDeliveryLine: false,
        rushModuleEnabled: true,
        canViewAnyCourierPage: true,
      }),
    ).toBe(false);
  });

  it('earnings policy visible for delivery-only when sidebar matrix allows', () => {
    expect(
      canSeeEarningsPolicy({
        hasSharedOps: true,
        sidebarVisible: true,
        canView: true,
      }),
    ).toBe(true);
  });

  it('rushModuleNavEnabled requires at least one rush module', () => {
    const allOff = () => false;
    const couriersOn = (k: string) => k === 'rush_couriers';
    expect(rushModuleNavEnabled(allOff)).toBe(false);
    expect(rushModuleNavEnabled(couriersOn)).toBe(true);
  });
});
