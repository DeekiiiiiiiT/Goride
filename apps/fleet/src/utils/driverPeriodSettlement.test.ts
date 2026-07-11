import { describe, it, expect } from 'vitest';
import { computePeriodSettlement } from './driverPeriodSettlement';

/**
 * Pins the corrected money math per the locked policy. These are the exact
 * worked examples from the plan — the numbers the flag-ON path must produce.
 */
describe('computePeriodSettlement', () => {
  it('cash toll: driver is CREDITED (no longer eats it) — the −65 case', () => {
    // $100 cash fare, $10 cash toll, $25 driver share, no fuel.
    const r = computePeriodSettlement({
      driverShare: 25,
      fuelDeduction: 0,
      baseCashOwed: 100,
      baseCashPaid: 0,
      tollCashWash: 10,
      tollPersonal: 0,
    });
    expect(r.netPayout).toBe(25);       // tolls NOT deducted from payout
    expect(r.cashOwed).toBe(100);
    expect(r.cashPaid).toBe(10);        // cash toll credited
    expect(r.cashBalance).toBe(90);
    expect(r.settlement).toBe(-65);     // driver owes $65 (correct), not $75
  });

  it('personal tag toll: driver is BILLED once, on the cash side', () => {
    const r = computePeriodSettlement({
      driverShare: 25,
      fuelDeduction: 0,
      baseCashOwed: 100,
      baseCashPaid: 0,
      tollCashWash: 0,
      tollPersonal: 10,
    });
    expect(r.netPayout).toBe(25);
    expect(r.cashOwed).toBe(110);       // driver owes the personal toll
    expect(r.cashPaid).toBe(0);
    expect(r.cashBalance).toBe(110);
    expect(r.tollChargedToDriver).toBe(10);
    expect(r.settlement).toBe(-85);     // owes $85
  });

  it('business/fleet tag toll: NO driver effect', () => {
    const r = computePeriodSettlement({
      driverShare: 25,
      fuelDeduction: 0,
      baseCashOwed: 100,
      baseCashPaid: 0,
      tollCashWash: 0,   // fleet-classified tolls are not passed as wash or personal
      tollPersonal: 0,
    });
    expect(r.settlement).toBe(-75);     // only the $100 cash held nets against $25
  });

  it('fuel still deducts from payout; tolls never do', () => {
    const r = computePeriodSettlement({
      driverShare: 100,
      fuelDeduction: 30,
      baseCashOwed: 0,
      baseCashPaid: 0,
      tollCashWash: 5,
      tollPersonal: 8,
    });
    expect(r.netPayout).toBe(70);       // 100 − 30 fuel, no toll term
    expect(r.cashOwed).toBe(8);         // personal toll
    expect(r.cashPaid).toBe(5);         // cash wash
    expect(r.cashBalance).toBe(3);
    expect(r.settlement).toBe(67);      // 70 − 3
  });

  // Step 7: fuelCredits is optional and additive — omitting it must not change
  // any of the above cases (adjCashBalance falls back to cashBalance).
  it('omitting fuelCredits leaves cashBalance/settlement unchanged (backward compatible)', () => {
    const r = computePeriodSettlement({
      driverShare: 25,
      fuelDeduction: 0,
      baseCashOwed: 100,
      baseCashPaid: 0,
      tollCashWash: 10,
      tollPersonal: 0,
    });
    expect(r.adjCashBalance).toBe(r.cashBalance);
    expect(r.settlement).toBe(-65);
  });

  it('fuelCredits net against the cash side, reducing what the driver owes', () => {
    // Same as the cash-toll case, but the driver was also given a $20 fuel credit.
    const r = computePeriodSettlement({
      driverShare: 25,
      fuelDeduction: 0,
      baseCashOwed: 100,
      baseCashPaid: 0,
      tollCashWash: 10,
      tollPersonal: 0,
      fuelCredits: 20,
    });
    expect(r.cashBalance).toBe(90);       // gross, unaffected by fuel credits
    expect(r.adjCashBalance).toBe(70);    // 90 − 20 fuel credit
    expect(r.settlement).toBe(-45);       // 25 − 70, driver owes $45 (was $65 without the credit)
  });

  it('a large fuel credit can flip settlement in the driver\'s favor', () => {
    const r = computePeriodSettlement({
      driverShare: 25,
      fuelDeduction: 0,
      baseCashOwed: 100,
      baseCashPaid: 0,
      tollCashWash: 0,
      tollPersonal: 0,
      fuelCredits: 150,
    });
    expect(r.adjCashBalance).toBe(-50);   // 100 − 150, driver has a net cash credit
    expect(r.settlement).toBe(75);        // 25 − (−50) = company owes the driver $75
  });
});
