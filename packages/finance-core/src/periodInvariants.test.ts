import { describe, expect, it } from 'vitest';
import { checkPeriodInvariants, recomputePeriodSettlement } from './periodInvariants.ts';

describe('periodInvariants', () => {
  it('P-1: persisted row consistent with formula produces no settlement drift', () => {
    const row = {
      driver_share: 1000,
      fuel_deduction: 0,
      cash_collected: 0,
      cash_returned: 0,
      toll_charged_to_driver: 2000,
      toll_cash_spend: 0,
      fuel_fleet_share: 0,
      cash_written_off: 0,
      settlement_paid: 5000,
      settlement_amount: -6000,
      payout_net: 1000,
      cash_still_held: 2000,
      tips_paid_to_driver: 0,
    };
    const settled = recomputePeriodSettlement(row);
    expect(settled.settlement).toBe(-6000);
    expect(settled.overpaidAmount).toBeGreaterThan(0);
    const drifts = checkPeriodInvariants(row);
    expect(drifts.filter((d) => d.kind === 'settlement_amount')).toHaveLength(0);
  });

  it('flags cash_still_held drift when wash metadata differs from toll_cash_spend', () => {
    const row = {
      cash_collected: 10000,
      cash_returned: 2000,
      toll_cash_spend: 3000,
      fuel_fleet_share: 0,
      cash_written_off: 0,
      cash_still_held: 5000,
      metadata: { financeCore: { tollCashWashEligible: 1000 } },
      driver_share: 0,
      fuel_deduction: 0,
      settlement_paid: 0,
      settlement_amount: 0,
      payout_net: 0,
    };
    const drifts = checkPeriodInvariants(row);
    expect(drifts.some((d) => d.kind === 'cash_still_held')).toBe(true);
  });
});
