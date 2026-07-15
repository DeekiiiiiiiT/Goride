import { describe, expect, it } from 'vitest';
import { buildLedgerPayoutPeriodRows } from './buildLedgerPayoutPeriodRows';
import { getPeriodSettlementComponents } from './driverSettlementMath';
import type { CashWeekData } from './cashSettlementCalc';
import type { FinancialTransaction } from '../types/data';

/**
 * Kenny Jun 29–Jul 5 2026 golden: after passenger cash − handbacks − fleet fuel − cash tolls − net payout,
 * fleet owes the driver (~+$5k), not driver owes ~$22k.
 */
describe('Kenny Jun 29 week settlement golden', () => {
  const weekStart = new Date('2026-06-29T00:00:00');
  const weekEnd = new Date('2026-07-05T23:59:59');

  const cashWeeks: CashWeekData[] = [
    {
      start: weekStart,
      end: weekEnd,
      // Uber payout_cash 33947.45 + InDrive 15350 + Roam 13200
      amountOwed: 62497.45,
      amountPaid: 12826.25,
      balance: 62497.45 - 12826.25,
      bankSettled: 48168.32,
      status: 'Partial',
      tripCount: 95,
      cashTripCount: 54,
      isFromCsv: true,
      weeklyFuelCredits: 2000,
      breakdown: {
        cashCollected: 62497.45,
        floatIssued: 0,
        allocatedPayments: 7500,
        fifoPayments: 3326.25,
        surplusPayments: 0,
        tollExpenses: 0,
        fuelCredits: 2000,
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

  it('uses fleet fuel share (not $2k reimbursement) + cash toll wash → Company Owes ~$5k', () => {
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
    expect(row.fuelCredits).toBeCloseTo(21415.26, 2);
    expect(row.netPayout).toBeCloseTo(34758.12 - 5084.74, 2);

    const { adjCashBalance, settlement } = getPeriodSettlementComponents(row);
    // Still held ≈ passenger − handbacks − fleet fuel − cash tolls
    // (Cash Paid includes $2k fuel credit already; fleet credit is the full companyShare.)
    expect(adjCashBalance).toBeCloseTo(26550.94, 0);
    // Fleet owes driver (positive settlement)
    expect(settlement).toBeCloseTo(3122.44, 0);
    expect(settlement).toBeGreaterThan(0);
  });
});
