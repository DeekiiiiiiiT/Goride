import { describe, expect, it } from 'vitest';
import {
  computeTollCardIdentityResidual,
  TOLL_CARD_IDENTITY_EPS,
} from './tollCardIdentity';

describe('computeTollCardIdentityResidual', () => {
  it('closes when the four cards satisfy the identity', () => {
    const r = computeTollCardIdentityResidual({
      tollSpend: 52400,
      reimbursed: 50010,
      chargedToDrivers: 2390,
      netTollLoss: 0,
    });
    expect(r.residual).toBeCloseTo(0, 2);
    expect(r.closes).toBe(true);
  });

  // Characterization of the audit's real broken week (headline problem #2):
  // 52,400 − 50,010 − 25,740 = −23,350, but the screen displayed +1,470.
  it('surfaces the audit gap week as a non-zero residual (including wrong output)', () => {
    const r = computeTollCardIdentityResidual({
      tollSpend: 52400,
      reimbursed: 50010,
      chargedToDrivers: 25740,
      netTollLoss: 1470,
    });
    expect(r.residual).toBeCloseTo(-24820, 2);
    expect(r.closes).toBe(false);
  });

  it('treats non-finite / missing values as zero', () => {
    const r = computeTollCardIdentityResidual({
      tollSpend: 100,
      // @ts-expect-error characterization of dirty upstream input
      reimbursed: undefined,
      // @ts-expect-error characterization of dirty upstream input
      chargedToDrivers: NaN,
      netTollLoss: 100,
    });
    expect(r.residual).toBeCloseTo(0, 2);
    expect(r.closes).toBe(true);
  });

  it('respects a custom tolerance', () => {
    const within = computeTollCardIdentityResidual(
      { tollSpend: 100.4, reimbursed: 100, chargedToDrivers: 0, netTollLoss: 0 },
      0.5,
    );
    expect(within.closes).toBe(true);
    const outside = computeTollCardIdentityResidual(
      { tollSpend: 100.4, reimbursed: 100, chargedToDrivers: 0, netTollLoss: 0 },
      TOLL_CARD_IDENTITY_EPS,
    );
    expect(outside.closes).toBe(false);
  });
});
