import { describe, expect, it } from 'vitest';
import { computeExpectedCashStillHeld, resolvePeriodTollCashWash } from './periodTollCashWash.ts';

describe('finance-recon cash_still_held identity', () => {
  it('P-0: uses tollCashWashEligible not full toll_cash_spend', () => {
    const row = {
      cash_collected: 10000,
      cash_returned: 2000,
      toll_charged_to_driver: 0,
      toll_cash_spend: 3000,
      fuel_fleet_share: 0,
      cash_written_off: 0,
      metadata: { financeCore: { tollCashWashEligible: 1000 } },
    };
    expect(resolvePeriodTollCashWash(row)).toBe(1000);
    expect(computeExpectedCashStillHeld(row)).toBe(7000);
  });

  it('legacy row without metadata falls back to toll_cash_spend', () => {
    const row = {
      cash_collected: 5000,
      cash_returned: 0,
      toll_charged_to_driver: 0,
      toll_cash_spend: 800,
      fuel_fleet_share: 200,
      cash_written_off: 0,
    };
    expect(computeExpectedCashStillHeld(row)).toBe(4000);
  });

  it('clamps negative balance to zero', () => {
    const row = {
      cash_collected: 100,
      cash_returned: 500,
      toll_charged_to_driver: 0,
      toll_cash_spend: 0,
      fuel_fleet_share: 0,
      cash_written_off: 0,
    };
    expect(computeExpectedCashStillHeld(row)).toBe(0);
  });
});
