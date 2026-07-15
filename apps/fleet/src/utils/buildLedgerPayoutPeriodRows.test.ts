import { describe, expect, it } from 'vitest';
import { buildLedgerPayoutPeriodRows } from './buildLedgerPayoutPeriodRows';
import type { FinancialTransaction } from '../types/data';

describe('buildLedgerPayoutPeriodRows toll week bucketing', () => {
  it('does not pull next-Monday unmatched toll into prior week (fleet tz)', () => {
    const tolls: FinancialTransaction[] = [
      {
        id: 't-in-week',
        date: '2026-07-04',
        amount: -380,
        type: 'Usage',
        category: 'Toll Usage',
        isReconciled: true,
        workflowStage: 'personal_use_resolved',
        status: 'pending',
        resolution: 'personal',
      } as any,
      {
        id: 't-next-week',
        date: '2026-07-06',
        amount: -285,
        type: 'Usage',
        category: 'Toll Usage',
        isReconciled: false,
        workflowStage: 'personal_use_pending',
        status: 'pending',
      } as any,
    ];

    const rows = buildLedgerPayoutPeriodRows({
      ledgerLoaded: true,
      ledgerError: false,
      ledgerRows: [
        {
          periodStart: '2026-06-29',
          periodEnd: '2026-07-05',
          grossRevenue: 100,
          driverShare: 50,
          tripCount: 1,
          tier: { name: 'T', sharePercentage: 50 },
        },
      ],
      cashWeeks: [],
      transactions: tolls,
      finalizedReports: [],
      periodType: 'weekly',
      timezone: 'America/Jamaica',
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].tollReconciled).toBe(1);
    expect(rows[0].tollUnreconciled).toBe(0);
  });

  it('expenseDeductions is fuel + charged-to-driver only (not gross toll spend)', () => {
    const transactions: FinancialTransaction[] = [
      {
        id: 'plaza-toll',
        date: '2026-07-01',
        amount: -3705,
        type: 'Usage',
        category: 'Toll Usage',
        isReconciled: true,
        workflowStage: 'matched',
        status: 'pending',
      } as any,
      {
        id: 'charge',
        date: '2026-07-02',
        amount: -1075,
        type: 'Deduction',
        category: 'Toll Charge',
        metadata: { projection: 'driver_toll_charge' },
      } as any,
    ];

    const rows = buildLedgerPayoutPeriodRows({
      ledgerLoaded: true,
      ledgerError: false,
      ledgerRows: [
        {
          periodStart: '2026-06-29',
          periodEnd: '2026-07-05',
          grossRevenue: 10000,
          driverShare: 5000,
          tripCount: 10,
          tier: { name: 'T', sharePercentage: 50 },
        },
      ],
      cashWeeks: [],
      transactions,
      finalizedReports: [
        {
          periodStart: '2026-06-29',
          periodEnd: '2026-07-05',
          driverShare: 5084.745,
          status: 'finalized',
        } as any,
      ],
      periodType: 'weekly',
      timezone: 'America/Jamaica',
    });

    expect(rows).toHaveLength(1);
    // Gross plaza spend must not inflate Settlement Deductions
    expect(rows[0].expenseDeductions).toBeCloseTo(5084.745 + 1075, 2);
    expect(rows[0].expenseDeductions).toBeLessThan(3705 + 5084.745 + 1075);
  });

  it('cash wash from disposition; Charged to Driver from Toll Charge rows only', () => {
    const rows = buildLedgerPayoutPeriodRows({
      ledgerLoaded: true,
      ledgerError: false,
      ledgerRows: [
        {
          periodStart: '2026-06-29',
          periodEnd: '2026-07-05',
          grossRevenue: 10000,
          driverShare: 5000,
          tripCount: 10,
          tier: { name: 'T', sharePercentage: 50 },
          // disposition.personal is intentionally wrong/high — must NOT win over Toll Charge
          tollDisposition: { cashWash: 1710, personal: 1995, fleet: 0, unresolved: 0 },
        },
      ],
      cashWeeks: [],
      transactions: [
        {
          id: 'real-charge',
          date: '2026-07-02',
          amount: -1075,
          type: 'Deduction',
          category: 'Toll Charge',
          metadata: { projection: 'driver_toll_charge' },
        } as any,
        {
          id: 'plaza-fallback',
          date: '2026-07-01',
          amount: -3705,
          type: 'Usage',
          category: 'Toll Usage',
          paymentMethod: 'Cash',
        } as any,
      ],
      finalizedReports: [],
      periodType: 'weekly',
      unifiedToll: true,
      timezone: 'America/Jamaica',
    });

    expect(rows).toHaveLength(1);
    // Cash credit still from disposition
    expect(rows[0].cashTollWash).toBeCloseTo(1710, 2);
    // Billed amount matches Expenses / Recon Charge Driver — not disposition.personal
    expect(rows[0].personalTollCharge).toBeCloseTo(1075, 2);
    expect(rows[0].tollExpenses).toBeCloseTo(1075, 2);
  });

  it('disposition cashWash=0 is respected (no client plaza fallback)', () => {
    const rows = buildLedgerPayoutPeriodRows({
      ledgerLoaded: true,
      ledgerError: false,
      ledgerRows: [
        {
          periodStart: '2026-06-29',
          periodEnd: '2026-07-05',
          grossRevenue: 100,
          driverShare: 50,
          tripCount: 1,
          tier: { name: 'T', sharePercentage: 50 },
          tollDisposition: { cashWash: 0, personal: 0, fleet: 100, unresolved: 0 },
        },
      ],
      cashWeeks: [],
      transactions: [
        {
          id: 'plaza',
          date: '2026-07-01',
          amount: -500,
          type: 'Usage',
          category: 'Toll Usage',
          paymentMethod: 'Cash',
        } as any,
      ],
      finalizedReports: [],
      periodType: 'weekly',
      unifiedToll: true,
      timezone: 'America/Jamaica',
    });

    expect(rows[0].cashTollWash).toBe(0);
  });

  it('marks non-finalized weeks as estimates with share-only take-home when no draft', () => {
    const rows = buildLedgerPayoutPeriodRows({
      ledgerLoaded: true,
      ledgerError: false,
      ledgerRows: [
        {
          periodStart: '2026-06-29',
          periodEnd: '2026-07-05',
          grossRevenue: 10000,
          driverShare: 3000,
          tripCount: 1,
          tier: { name: 'T', sharePercentage: 30 },
        },
      ],
      cashWeeks: [],
      transactions: [],
      finalizedReports: [],
      periodType: 'weekly',
      unifiedToll: true,
    });

    expect(rows[0].isEstimate).toBe(true);
    expect(rows[0].isFinalized).toBe(false);
    expect(rows[0].status).toBe('Pending');
    expect(rows[0].fuelDeduction).toBe(0);
    expect(rows[0].netPayout).toBe(3000);
  });

  it('applies draft fuel on Pending Fuel weeks for Payout estimates', () => {
    const rows = buildLedgerPayoutPeriodRows({
      ledgerLoaded: true,
      ledgerError: false,
      ledgerRows: [
        {
          periodStart: '2026-06-29',
          periodEnd: '2026-07-05',
          grossRevenue: 10000,
          driverShare: 3000,
          tripCount: 1,
          tier: { name: 'T', sharePercentage: 30 },
        },
      ],
      cashWeeks: [],
      transactions: [],
      finalizedReports: [],
      periodType: 'weekly',
      unifiedToll: true,
      draftFuelByPeriod: {
        '2026-06-29': { deduction: 400, fleetShare: 800 },
      },
    });

    expect(rows[0].isFinalized).toBe(false);
    expect(rows[0].isEstimate).toBe(true);
    expect(rows[0].fuelDeduction).toBe(400);
    expect(rows[0].netPayout).toBe(2600);
    expect(rows[0].status).toBe('Pending');
  });
});
