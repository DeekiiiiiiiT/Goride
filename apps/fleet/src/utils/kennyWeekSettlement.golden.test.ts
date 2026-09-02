import { describe, expect, it } from 'vitest';
import { buildLedgerPayoutPeriodRows } from './buildLedgerPayoutPeriodRows';
import { getPeriodSettlementComponents } from './driverSettlementMath';
import { computePeriodSettlement } from './driverPeriodSettlement';
import type { CashWeekData } from './cashSettlementCalc';

/**
 * Kenny Jun 29–Jul 5 2026 — live production path:
 * Cash Returned $7,500 · Fleet Fuel $21,415.26 · Cash Toll Credit $1,710 (disposition)
 * Still Held $31,872.19 · Settlement −$2,198.81
 * (Passenger only — never float)
 */
describe('Kenny Jun 29 week settlement golden', () => {
  const weekStart = new Date('2026-06-29T00:00:00');
  const weekEnd = new Date('2026-07-05T23:59:59');

  const cashWeeks: CashWeekData[] = [
    {
      start: weekStart,
      end: weekEnd,
      amountOwed: 62497.45,
      amountPaid: 7500,
      balance: 62497.45 - 7500,
      bankSettled: 48168.32,
      status: 'Partial',
      tripCount: 95,
      cashTripCount: 54,
      isFromCsv: true,
      weeklyFuelCredits: 0,
      breakdown: {
        cashCollected: 62497.45,
        floatIssued: 1995,
        allocatedPayments: 7500,
        fifoPayments: 0,
        surplusPayments: 0,
        tollExpenses: 0,
        fuelCredits: 0,
        tollCharges: 0,
        bankSettled: 48168.32,
        uberCash: 33947.45,
        nonUberTripCash: 28550,
      },
    },
  ];

  it('Cash Returned + disposition toll credit match live Settlement desk', () => {
    const rows = buildLedgerPayoutPeriodRows({
      ledgerLoaded: true,
      ledgerError: false,
      ledgerRows: [
        {
          periodStart: '2026-06-29',
          periodEnd: '2026-07-05',
          grossRevenue: 105327.64,
          driverShare: 34758.12,
          tripCount: 95,
          tier: { name: 'Bronze', sharePercentage: 33 },
          tollDisposition: { cashWash: 1710, personal: 0, fleet: 0, unresolved: 0 },
        },
      ],
      cashWeeks,
      transactions: [],
      finalizedReports: [
        {
          weekStart: '2026-06-29',
          weekEnd: '2026-07-05',
          driverShare: 5084.74,
          companyShare: 21415.26,
          driverSpend: 26500,
          status: 'Finalized',
        },
      ],
      lockedWeekStarts: ['2026-06-29'],
      periodType: 'weekly',
      unifiedToll: true,
      timezone: 'America/Jamaica',
    });

    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.isFinalized).toBe(true);
    expect(row.passengerCash).toBeCloseTo(62497.45, 2);
    expect(row.cashPaid).toBeCloseTo(7500, 2);
    expect(row.fuelCredits).toBeCloseTo(21415.26, 2);
    expect(row.cashTollWash).toBeCloseTo(1710, 2);
    expect(row.personalTollCharge).toBe(0);
    expect(row.netPayout).toBeCloseTo(34758.12 - 5084.74, 2);

    const { adjCashBalance, settlement } = getPeriodSettlementComponents(row);
    // 62,497.45 − 7,500 − 21,415.26 − 1,710 = 31,872.19 still held
    // 29,673.38 − 31,872.19 = −2,198.81 (driver owes)
    expect(adjCashBalance).toBeCloseTo(31872.19, 2);
    expect(settlement).toBeCloseTo(-2198.81, 2);
  });
});

/**
 * Golden B — audit fields that Kenny A zeroes: tips, wash already netted once,
 * write-off, prior settlement paid, overpay, tolls not clear → not finalized for pay.
 */
describe('Settlement audit golden B — tips / overpay / write-off', () => {
  it('tips add to net; overpay surfaces; write-off reduces still held', () => {
    const r = computePeriodSettlement({
      driverShare: 10000,
      fuelDeduction: 500,
      baseCashOwed: 8000,
      baseCashPaid: 2000,
      tollCashWash: 500,
      tollPersonal: 0,
      fuelCredits: 1000,
      cashWrittenOff: 200,
      settlementPaid: 12000,
      tipsPaidToDriver: 580,
    });
    expect(r.netPayout).toBe(10080); // 10000 − 500 + 580
    expect(r.adjCashBalance).toBe(4300); // 8000 − 2000 − 500 − 1000 − 200
    expect(r.grossSettlement).toBe(5780);
    expect(r.settlementPaid).toBe(12000);
    expect(r.overpaidAmount).toBe(6220);
    expect(r.settlement).toBe(-6220);
  });
});
