/**
 * Receipt-first Log Cash — Kenny Sep 7–13 shaped week.
 * Logging cash updates Cash Returned / still held immediately; residual recomputes
 * without requiring moneyUnlocked. Later fuel/toll finalize changes residual only.
 */
import { describe, expect, it } from 'vitest';
import { computeWeekCashBase } from './periodShareCash.ts';
import { computePeriodSettlement } from './driverPeriodSettlement.ts';

const ANCHOR = '2026-09-07';
const END = '2026-09-13';
/** Live-shaped passenger cash (cash_still_held before any return ≈ 52575.61). */
const PASSENGER = 52575.61;
/** Pre-recon driver share residual magnitude from settlement_amount ≈ -23835.91. */
const DRIVER_SHARE = 28740.0;
const FUEL_DED = 0;

describe('Log Cash receipt — Kenny Sep 7 golden', () => {
  it('logging $5000 raises Cash Returned and lowers still held without unlock', () => {
    const before = computeWeekCashBase({
      periodAnchor: ANCHOR,
      periodEnd: END,
      trips: [
        {
          date: `${ANCHOR}T12:00:00`,
          platform: 'InDrive',
          paymentMethod: 'Cash',
          cashCollected: PASSENGER,
          status: 'Completed',
        },
      ],
      transactions: [],
    });
    expect(before.passengerCash).toBeCloseTo(PASSENGER, 2);
    expect(before.cashReturned).toBe(0);

    const afterLog = computeWeekCashBase({
      periodAnchor: ANCHOR,
      periodEnd: END,
      trips: [
        {
          date: `${ANCHOR}T12:00:00`,
          platform: 'InDrive',
          paymentMethod: 'Cash',
          cashCollected: PASSENGER,
          status: 'Completed',
        },
      ],
      transactions: [
        {
          date: '2026-10-20',
          amount: 5000,
          category: 'Cash Collection',
          type: 'Payment_Received',
          paymentMethod: 'Cash',
          status: 'Completed',
          metadata: { workPeriodStart: ANCHOR },
        },
      ],
    });
    expect(afterLog.cashReturned).toBeCloseTo(5000, 2);
    const heldBefore = PASSENGER - before.cashReturned;
    const heldAfter = PASSENGER - afterLog.cashReturned;
    expect(heldAfter).toBeCloseTo(heldBefore - 5000, 2);
    expect(heldAfter).toBeCloseTo(47575.61, 2);

    // Residual before recon (no fuel deduction yet) — Log Cash does not wait on unlock.
    const settleBefore = computePeriodSettlement({
      driverShare: DRIVER_SHARE,
      fuelDeduction: FUEL_DED,
      baseCashOwed: PASSENGER,
      baseCashPaid: 0,
    });
    const settleAfter = computePeriodSettlement({
      driverShare: DRIVER_SHARE,
      fuelDeduction: FUEL_DED,
      baseCashOwed: PASSENGER,
      baseCashPaid: 5000,
    });
    // More cash returned → adjCashBalance down → grossSettlement up (less driver-owes / more fleet-owes).
    expect(settleAfter.adjCashBalance).toBeCloseTo(settleBefore.adjCashBalance - 5000, 2);
    expect(settleAfter.settlement).toBeCloseTo(settleBefore.settlement + 5000, 2);
  });

  it('later fuel finalize changes residual; Cash Returned stays 5000', () => {
    const cash = computeWeekCashBase({
      periodAnchor: ANCHOR,
      periodEnd: END,
      trips: [
        {
          date: `${ANCHOR}T12:00:00`,
          platform: 'InDrive',
          paymentMethod: 'Cash',
          cashCollected: PASSENGER,
          status: 'Completed',
        },
      ],
      transactions: [
        {
          date: '2026-10-20',
          amount: 5000,
          category: 'Cash Collection',
          type: 'Payment_Received',
          paymentMethod: 'Cash',
          status: 'Completed',
          metadata: { workPeriodStart: ANCHOR },
        },
      ],
    });
    expect(cash.cashReturned).toBeCloseTo(5000, 2);

    const beforeFuel = computePeriodSettlement({
      driverShare: DRIVER_SHARE,
      fuelDeduction: 0,
      baseCashOwed: PASSENGER,
      baseCashPaid: 5000,
      fuelCredits: 0,
    });
    const afterFuel = computePeriodSettlement({
      driverShare: DRIVER_SHARE,
      fuelDeduction: 8000,
      baseCashOwed: PASSENGER,
      baseCashPaid: 5000,
      fuelCredits: 8000,
    });
    expect(cash.cashReturned).toBeCloseTo(5000, 2);
    expect(afterFuel.netPayout).toBeCloseTo(beforeFuel.netPayout - 8000, 2);
    // Fuel credit reduces adj held → residual flips independently of Cash Returned.
    expect(afterFuel.adjCashBalance).toBeCloseTo(beforeFuel.adjCashBalance - 8000, 2);
  });
});
