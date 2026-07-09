import { describe, it, expect } from 'vitest';
import {
  computeChargeShortfall,
  guardClaimChargeAmount,
  isFullTollChargeWhenShortfallRemains,
} from './claimChargeGuard';

describe('claimChargeGuard', () => {
  it('285 toll / 275 platform → $10 shortfall', () => {
    expect(computeChargeShortfall(285, 275, 0)).toBe(10);
    expect(computeChargeShortfall(285, 275, 275)).toBe(10);
  });

  it('blocks charging full toll when only shortfall remains', () => {
    expect(isFullTollChargeWhenShortfallRemains(285, 285, 10)).toBe(true);
    expect(isFullTollChargeWhenShortfallRemains(10, 285, 10)).toBe(false);
  });

  it('allows full toll charge when no platform credit (deadhead/personal)', () => {
    expect(computeChargeShortfall(380, 0, 0)).toBe(380);
    const r = guardClaimChargeAmount({ chargeAmount: 380, tollCost: 380, platformRefund: 0 });
    expect(r.ok).toBe(true);
  });

  it('blocks $380 charge on $380 toll with $370 platform paid', () => {
    const r = guardClaimChargeAmount({
      chargeAmount: 380,
      tollCost: 380,
      platformRefund: 370,
      claimPaidAmount: 370,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.suggestedAmount).toBe(10);
  });

  it('allows $10 charge on underpaid toll', () => {
    const r = guardClaimChargeAmount({
      chargeAmount: 10,
      tollCost: 285,
      platformRefund: 275,
      claimPaidAmount: 275,
    });
    expect(r.ok).toBe(true);
  });
});
