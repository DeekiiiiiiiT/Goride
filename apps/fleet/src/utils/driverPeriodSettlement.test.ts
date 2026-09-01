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

  it('cash write-off reduces still held without counting as cash paid', () => {
    const r = computePeriodSettlement({
      driverShare: 25,
      fuelDeduction: 0,
      baseCashOwed: 100,
      baseCashPaid: 20,
      tollCashWash: 0,
      tollPersonal: 0,
      fuelCredits: 0,
      cashWrittenOff: 30,
    });
    expect(r.cashPaid).toBe(20);          // write-off is NOT cash returned
    expect(r.cashBalance).toBe(80);
    expect(r.adjCashBalance).toBe(50);    // 80 − 30 write-off
    expect(r.settlement).toBe(-25);       // 25 − 50
  });

  it('omitting cashWrittenOff leaves still held unchanged (backward compatible)', () => {
    const r = computePeriodSettlement({
      driverShare: 25,
      fuelDeduction: 0,
      baseCashOwed: 100,
      baseCashPaid: 0,
      tollCashWash: 10,
      tollPersonal: 0,
    });
    expect(r.adjCashBalance).toBe(90);
  });

  it('settlementPaid clears company_owes residual without touching cash returned', () => {
    // Net payout exceeds cash still held → fleet owes driver
    const r = computePeriodSettlement({
      driverShare: 5000,
      fuelDeduction: 0,
      baseCashOwed: 10000,
      baseCashPaid: 0,
      tollCashWash: 0,
      tollPersonal: 0,
      fuelCredits: 6043.65,
      cashWrittenOff: 0,
      settlementPaid: 0,
    });
    // still held = 10000 − 6043.65 = 3956.35; settlement = 5000 − 3956.35 = 1043.65
    expect(r.cashPaid).toBe(0);
    expect(r.grossSettlement).toBeCloseTo(1043.65, 2);
    expect(r.settlement).toBeCloseTo(1043.65, 2);

    const paid = computePeriodSettlement({
      driverShare: 5000,
      fuelDeduction: 0,
      baseCashOwed: 10000,
      baseCashPaid: 0,
      tollCashWash: 0,
      tollPersonal: 0,
      fuelCredits: 6043.65,
      settlementPaid: 1043.65,
    });
    expect(paid.cashPaid).toBe(0); // payout is NOT cash returned
    expect(paid.adjCashBalance).toBeCloseTo(r.adjCashBalance, 2);
    expect(paid.settlementPaid).toBeCloseTo(1043.65, 2);
    expect(paid.settlement).toBeCloseTo(0, 2);
  });

  it('partial settlementPaid leaves residual company_owes', () => {
    const r = computePeriodSettlement({
      driverShare: 100,
      fuelDeduction: 0,
      baseCashOwed: 0,
      baseCashPaid: 0,
      tollCashWash: 0,
      tollPersonal: 0,
      settlementPaid: 40,
    });
    expect(r.grossSettlement).toBe(100);
    expect(r.settlementPaid).toBe(40);
    expect(r.settlement).toBe(60);
  });

  it('settlementPaid on a driver_owes week folds into continuous residual', () => {
    const r = computePeriodSettlement({
      driverShare: 25,
      fuelDeduction: 0,
      baseCashOwed: 100,
      baseCashPaid: 0,
      tollCashWash: 0,
      tollPersonal: 0,
      settlementPaid: 50,
    });
    expect(r.grossSettlement).toBe(-75);
    expect(r.settlementPaid).toBe(50);
    expect(r.overpaidAmount).toBe(50);
    // Continuous: settlement = gross − paid = −75 − 50
    expect(r.settlement).toBe(-125);
  });

  it('settlement residual is continuous across grossSettlement = 0', () => {
    const paid = 5000;
    const base = {
      driverShare: 0,
      fuelDeduction: 0,
      baseCashOwed: 0,
      baseCashPaid: 0,
      tollCashWash: 0,
      tollPersonal: 0,
      settlementPaid: paid,
    };
    // gross = netPayout − adjCash = driverShare (with zero cash) — set via fuelCredits flip
    const pos = computePeriodSettlement({
      ...base,
      driverShare: 0.01,
    });
    const zero = computePeriodSettlement({
      ...base,
      driverShare: 0,
    });
    const neg = computePeriodSettlement({
      ...base,
      driverShare: 0,
      baseCashOwed: 0.01, // adjCash = 0.01 → gross = −0.01
    });
    expect(pos.grossSettlement).toBeCloseTo(0.01, 2);
    expect(pos.settlement).toBeCloseTo(0.01 - paid, 2);
    expect(zero.grossSettlement).toBe(0);
    expect(zero.settlement).toBe(-paid);
    expect(neg.grossSettlement).toBeCloseTo(-0.01, 2);
    expect(neg.settlement).toBeCloseTo(-0.01 - paid, 2);
    // Continuity: moving across zero only changes settlement by the gross delta
    expect(Math.abs(pos.settlement - zero.settlement)).toBeCloseTo(0.01, 2);
    expect(Math.abs(zero.settlement - neg.settlement)).toBeCloseTo(0.01, 2);
  });

  it('driver-owes plus prior payout exposes full Collect amount', () => {
    // gross −2000, paid 5000 → settlement −7000 (Collect), overpaidAmount 5000
    const r = computePeriodSettlement({
      driverShare: 0,
      fuelDeduction: 0,
      baseCashOwed: 2000,
      baseCashPaid: 0,
      tollCashWash: 0,
      tollPersonal: 0,
      settlementPaid: 5000,
    });
    expect(r.grossSettlement).toBe(-2000);
    expect(r.overpaidAmount).toBe(5000);
    expect(r.settlement).toBe(-7000);
  });

  it('overpay above gross leaves overpaidAmount and negative residual', () => {
    const r = computePeriodSettlement({
      driverShare: 10000,
      fuelDeduction: 0,
      baseCashOwed: 0,
      baseCashPaid: 0,
      tollCashWash: 0,
      tollPersonal: 0,
      settlementPaid: 10000,
    });
    // Late cash import drops gross to 7000-equivalent: recompute with lower share
    const after = computePeriodSettlement({
      driverShare: 7000,
      fuelDeduction: 0,
      baseCashOwed: 0,
      baseCashPaid: 0,
      tollCashWash: 0,
      tollPersonal: 0,
      settlementPaid: 10000,
    });
    expect(r.settlement).toBe(0);
    expect(r.overpaidAmount).toBe(0);
    expect(after.settlementPaid).toBe(10000);
    expect(after.overpaidAmount).toBe(3000);
    expect(after.settlement).toBe(-3000);
  });

  it('tipsPaidToDriver adds to net payout', () => {
    const r = computePeriodSettlement({
      driverShare: 1000,
      fuelDeduction: 100,
      baseCashOwed: 0,
      baseCashPaid: 0,
      tollCashWash: 0,
      tollPersonal: 0,
      tipsPaidToDriver: 580,
    });
    expect(r.netPayout).toBe(1480);
  });
});
