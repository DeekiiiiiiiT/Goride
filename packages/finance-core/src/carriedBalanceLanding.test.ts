import { describe, expect, it } from 'vitest';
import {
  CORRECTIONS_LAND_ON,
  carriedBalanceMustLandOnReason,
  resolveCarriedBalanceLanding,
} from './carriedBalanceLanding';

const NEWER_OPEN_WEEKS = ['2026-10-26', '2026-11-02', '2026-11-09', '2026-11-16'];

describe('resolveCarriedBalanceLanding', () => {
  it('uses CORRECTIONS_LAND_ON when it is open even if later weeks are open', () => {
    expect(NEWER_OPEN_WEEKS.length).toBeGreaterThan(0);
    const r = resolveCarriedBalanceLanding({
      landOn: CORRECTIONS_LAND_ON,
      periodAnchor: CORRECTIONS_LAND_ON,
      frozen: false,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.landingWeek).toBe('2026-10-19');
      expect(r.reason).toBe('');
    }
  });

  it('refuses when the land-on week is frozen (closed) and posts nothing', () => {
    const r = resolveCarriedBalanceLanding({
      landOn: CORRECTIONS_LAND_ON,
      periodAnchor: CORRECTIONS_LAND_ON,
      frozen: true,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.landingWeek).toBeNull();
      expect(r.reason).toContain('2026-10-19');
    }
  });

  it('refuses when the land-on row is missing', () => {
    const r = resolveCarriedBalanceLanding({
      landOn: CORRECTIONS_LAND_ON,
      periodAnchor: null,
      frozen: false,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.landingWeek).toBeNull();
      expect(r.reason).toBe(carriedBalanceMustLandOnReason(CORRECTIONS_LAND_ON));
    }
  });
});