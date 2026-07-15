import { describe, expect, it } from 'vitest';
import { buildLedgerPayoutPeriodRows } from './buildLedgerPayoutPeriodRows';
import { getPeriodSettlementComponents } from './driverSettlementMath';
import type { CashWeekData } from './cashSettlementCalc';
import type { FinancialTransaction } from '../types/data';

/**
 * Kenny Jun 29–Jul 5 2026 — Cash Returned = Settlement Week–tagged cash only ($7,500).
 * Fuel reimbursements never pad Cash Returned; fleet fuel + cash tolls credit on Settlement.
 *
 *   62,497.45 passenger − 7,500 cash returned − 21,415.26 fleet fuel − 3,705 cash tolls
 *     = 29,877.19 still held
 *   29,673.38 net payout − 29,877.19
 *     ≈ −203.81 (near even; small driver owing)
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

  const cashToll: FinancialTransaction = {
    id: 'plaza-cash',
    date: '2026-07-01',
    amount: -3705,
    type: 'Usage',
    category: 'Toll Usage',
    paymentMethod: 'Cash',
    isReconciled: true,
    status: 'pending',
  } as FinancialTransaction;

  it('Cash Returned is tagged cash only; fleet fuel + tolls stay outside Cash Returned', () => {
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
          tollDisposition: { cashWash: 0, personal: 0 },
        },
      ],
      cashWeeks,
      transactions: [cashToll],
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
    expect(row.cashTollWash).toBeCloseTo(3705, 2);
    expect(row.netPayout).toBeCloseTo(34758.12 - 5084.74, 2);

    const { adjCashBalance, settlement } = getPeriodSettlementComponents(row);
    expect(adjCashBalance).toBeCloseTo(29877.19, 2);
    expect(settlement).toBeCloseTo(-203.81, 2);
  });
});
