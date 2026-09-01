import { describe, expect, it } from 'vitest';
import {
  computePeriodSettlement,
  computePeriodSettlementMinor,
} from './driverPeriodSettlement.ts';
import { fromMoneyMinor, toMoneyMinor } from './money.ts';

describe('computePeriodSettlementMinor (A-3)', () => {
  it('matches major wrapper for representative week', () => {
    const input = {
      driverShare: 25000,
      fuelDeduction: 1200,
      baseCashOwed: 8000,
      baseCashPaid: 3500,
      tollCashWash: 500,
      tollPersonal: 200,
      fuelCredits: 100,
      cashWrittenOff: 50,
      settlementPaid: 5000,
      tipsPaidToDriver: 300,
    };
    const major = computePeriodSettlement(input);
    const minor = computePeriodSettlementMinor(input);
    expect(fromMoneyMinor(minor.netPayoutMinor)).toBe(major.netPayout);
    expect(fromMoneyMinor(minor.settlementMinor)).toBe(major.settlement);
    expect(fromMoneyMinor(minor.grossSettlementMinor)).toBe(major.grossSettlement);
    expect(fromMoneyMinor(minor.overpaidAmountMinor)).toBe(major.overpaidAmount);
  });

  it('handles negative gross settlement continuously', () => {
    const input = {
      driverShare: 1000,
      fuelDeduction: 200,
      baseCashOwed: 0,
      baseCashPaid: 0,
      tollCashWash: 0,
      tollPersonal: 0,
      settlementPaid: 5000,
    };
    const m = computePeriodSettlementMinor(input);
    expect(m.settlementMinor).toBe(toMoneyMinor(-7000));
    expect(m.overpaidAmountMinor).toBe(toMoneyMinor(5000));
  });
});
