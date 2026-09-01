import { describe, expect, it } from 'vitest';
import { round2 } from './money.ts';
import { computePeriodSettlement } from './driverPeriodSettlement.ts';
import { getAdjCashBalance, getPeriodSettlementComponents } from './driverSettlementMath.ts';
import { getTierForEarningsEH } from './periodShareCash.ts';
import { isClearedDriverCashPayment } from './driverCashPayment.ts';
import { foldPayoutCashByWeek } from './payoutCashDedupe.ts';
import type { SettlementPeriodRow } from './types.ts';

/** Phase 0 regression pins for SETTLEMENT_CALCULATION_AUDIT.md */
describe('settlement audit regressions', () => {
  it('1.1 cash-sync equivalent keeps tips in net payout', () => {
    const withTips = computePeriodSettlement({
      driverShare: 10000,
      fuelDeduction: 500,
      baseCashOwed: 8000,
      baseCashPaid: 5000,
      tollCashWash: 200,
      tollPersonal: 0,
      fuelCredits: 1000,
      tipsPaidToDriver: 580,
    });
    const missingTips = computePeriodSettlement({
      driverShare: 10000,
      fuelDeduction: 500,
      baseCashOwed: 8000,
      baseCashPaid: 5000,
      tollCashWash: 200,
      tollPersonal: 0,
      fuelCredits: 1000,
      // tips omitted → 0 (sync bug). Callers must pass tips.
    });
    expect(withTips.netPayout).toBe(10080);
    expect(missingTips.netPayout).toBe(9500);
    expect(withTips.netPayout - missingTips.netPayout).toBe(580);
  });

  it('1.2 adjCashBalance may be negative; clamp for cash_still_held is caller-side', () => {
    const r = computePeriodSettlement({
      driverShare: 100,
      fuelDeduction: 0,
      baseCashOwed: 100,
      baseCashPaid: 80,
      tollCashWash: 0,
      tollPersonal: 0,
      fuelCredits: 50,
    });
    expect(r.adjCashBalance).toBeLessThan(0);
    expect(Math.max(0, r.adjCashBalance)).toBe(0);
  });

  it('1.5 overpay is not silently absorbed', () => {
    const r = computePeriodSettlement({
      driverShare: 7000,
      fuelDeduction: 0,
      baseCashOwed: 0,
      baseCashPaid: 0,
      tollCashWash: 0,
      tollPersonal: 0,
      settlementPaid: 10000,
    });
    expect(r.settlementPaid).toBe(10000);
    expect(r.overpaidAmount).toBe(3000);
    expect(r.settlement).toBe(-3000);
  });

  it('2.1 getPeriodSettlementComponents does not double-net wash', () => {
    const row = {
      isFinalized: true,
      netPayout: 1000,
      passengerCash: 5000,
      cashOwed: 5000,
      cashPaid: 1000,
      cashTollWash: 500, // already net of any legacy tollCredits
      personalTollCharge: 0,
      fuelCredits: 0,
      cashWrittenOff: 0,
      settlementPaid: 0,
      cashPaidBreakdown: { tollCredits: 500 },
    } as SettlementPeriodRow;
    const c = getPeriodSettlementComponents(row);
    // If double-netted, wash would be 0 and adj would be 4000; correct wash 500 → adj 3500
    expect(c.adjCashBalance).toBe(3500);
  });

  it('2.4 tier overflow falls back to highest tier', () => {
    const tiers = [
      { id: 't1', name: 'Bronze', minEarnings: 0, maxEarnings: 50000, sharePercentage: 25 },
      { id: 't2', name: 'Silver', minEarnings: 50000, maxEarnings: 100000, sharePercentage: 28 },
      { id: 't3', name: 'Gold', minEarnings: 100000, maxEarnings: 150000, sharePercentage: 30 },
    ];
    const tier = getTierForEarningsEH(200000, tiers);
    expect(tier.id).toBe('t3');
    expect(tier.sharePercentage).toBe(30);
  });

  it('2.3 / 3.5 getAdjCashBalance includes write-offs', () => {
    expect(getAdjCashBalance(100, 20, 10)).toBe(70);
  });

  it('3.4 round2 is half-away-from-zero and handles 1.005', () => {
    expect(round2(0.125)).toBe(0.13);
    expect(round2(-0.125)).toBe(-0.13);
    expect(round2(1.005)).toBe(1.01);
  });

  it('3.9 blank cash status is not cleared', () => {
    expect(
      isClearedDriverCashPayment({
        amount: 100,
        category: 'Cash Collection',
        type: 'Payment_Received',
        paymentMethod: 'Cash',
        status: '',
      }),
    ).toBe(false);
    expect(
      isClearedDriverCashPayment({
        amount: 100,
        category: 'Cash Collection',
        type: 'Payment_Received',
        paymentMethod: 'Cash',
        status: 'completed',
      }),
    ).toBe(true);
  });

  it('3.2 distinct-id same-day same-amount remittances are both kept', () => {
    const map = foldPayoutCashByWeek([
      {
        id: 'a',
        date: '2026-08-04',
        netAmount: 1000,
        eventType: 'payout_cash',
        driverId: 'd1',
      },
      {
        id: 'b',
        date: '2026-08-04',
        netAmount: 1000,
        eventType: 'payout_cash',
        driverId: 'd1',
      },
    ]);
    const total = [...map.values()].reduce((s, v) => s + v, 0);
    expect(total).toBe(2000);
  });

  it('NEW-2: settlement residual is continuous across grossSettlement = 0', () => {
    const paid = 5000;
    const nearPos = computePeriodSettlement({
      driverShare: 0.01,
      fuelDeduction: 0,
      baseCashOwed: 0,
      baseCashPaid: 0,
      tollCashWash: 0,
      tollPersonal: 0,
      settlementPaid: paid,
    });
    const atZero = computePeriodSettlement({
      driverShare: 0,
      fuelDeduction: 0,
      baseCashOwed: 0,
      baseCashPaid: 0,
      tollCashWash: 0,
      tollPersonal: 0,
      settlementPaid: paid,
    });
    const nearNeg = computePeriodSettlement({
      driverShare: 0,
      fuelDeduction: 0,
      baseCashOwed: 0.01,
      baseCashPaid: 0,
      tollCashWash: 0,
      tollPersonal: 0,
      settlementPaid: paid,
    });
    expect(nearPos.settlement).toBe(-4999.99);
    expect(atZero.settlement).toBe(-5000);
    expect(nearNeg.settlement).toBe(-5000.01);
  });

  it('NEW-1/NEW-2: driver_owes week with prior payout → Collect residual, overpaid badge only', () => {
    const r = computePeriodSettlement({
      driverShare: 0,
      fuelDeduction: 0,
      baseCashOwed: 2000,
      baseCashPaid: 0,
      tollCashWash: 0,
      tollPersonal: 0,
      settlementPaid: 5000,
    });
    // gross = 0 − 2000 = −2000; settlement = −2000 − 5000 = −7000 (Collect)
    expect(r.grossSettlement).toBe(-2000);
    expect(r.settlement).toBe(-7000);
    expect(r.overpaidAmount).toBe(5000);
    // Directional queue key: negative residual → driver_owes (not overpaid status)
    expect(r.settlement < -0.005).toBe(true);
  });

  it('NEW-3: pending trip toll wash stays 0 while actionable count would block Pay', () => {
    // Formula only receives wash credit — pending trips must not inflate wash.
    const withWash = computePeriodSettlement({
      driverShare: 5000,
      fuelDeduction: 0,
      baseCashOwed: 0,
      baseCashPaid: 0,
      tollCashWash: 400, // only cash_wash / handled cash
      tollPersonal: 0,
    });
    const pendingNoWash = computePeriodSettlement({
      driverShare: 5000,
      fuelDeduction: 0,
      baseCashOwed: 0,
      baseCashPaid: 0,
      tollCashWash: 0, // pending/null trip must not credit wash
      tollPersonal: 0,
    });
    expect(withWash.tollCashWash).toBe(400);
    expect(pendingNoWash.tollCashWash).toBe(0);
    // Wash increases cashPaid → lowers held → raises grossSettlement
    expect(withWash.grossSettlement).toBeGreaterThan(pendingNoWash.grossSettlement);
  });
});
