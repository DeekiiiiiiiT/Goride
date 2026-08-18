import { describe, expect, it } from 'vitest';
import { computePeriodSettlement } from './driverPeriodSettlement';
import { aggregateCanonicalEventsToLedgerDriverOverview } from './ledgerMoneyAggregate';
import { computeWeeklyCashSettlement } from './cashSettlementCalc';

/**
 * Phase 0 characterization — pins what the engines said on 2026-08-18.
 * Policy expected values live in docs/finance-recon/kenny-aug-3-worksheet.md
 * and finance-core tests.
 */

describe('Engine A characterization — Kenny live snapshots via shared formula', () => {
  it('Aug 3–9 2026 matches persisted projection (double-counted cash as stored)', () => {
    const r = computePeriodSettlement({
      driverShare: 23704.69,
      fuelDeduction: 1412.11,
      baseCashOwed: 84172.52,
      baseCashPaid: 16000,
      tollCashWash: 1720,
      tollPersonal: 595,
      fuelCredits: 25887.89,
    });
    expect(r.netPayout).toBeCloseTo(22292.58, 2);
    expect(r.adjCashBalance).toBeCloseTo(41159.63, 2);
    expect(r.settlement).toBeCloseTo(-18867.05, 2);
  });

  it('Jun 29–Jul 5 2026 Engine A snapshot (settled)', () => {
    const r = computePeriodSettlement({
      driverShare: 34758.12,
      fuelDeduction: 5864.07,
      baseCashOwed: 62497.45,
      baseCashPaid: 11655.91,
      tollCashWash: 5005,
      tollPersonal: 2015,
      fuelCredits: 20635.93,
    });
    expect(r.adjCashBalance).toBeCloseTo(27215.61, 2);
  });

  it('Apr 6–12 2026 quiet week Engine A snapshot', () => {
    const r = computePeriodSettlement({
      driverShare: 8518.02,
      fuelDeduction: 4549.59,
      baseCashOwed: 34392.19,
      baseCashPaid: 5888.46,
      tollCashWash: 0,
      tollPersonal: 950,
      fuelCredits: 8081.85,
    });
    expect(r.netPayout).toBeCloseTo(3968.43, 2);
    expect(r.adjCashBalance).toBeCloseTo(21371.88, 2);
    expect(r.settlement).toBeCloseTo(-17403.45, 2);
  });
});

describe('Engine C characterization — statement cash vs trip fallback', () => {
  const driver = '73e5b1dc-01b4-45ee-a34a-25a3256b9841';
  it('payout_cash fills Uber cash; InDrive trip cash adds', () => {
    const data = aggregateCanonicalEventsToLedgerDriverOverview(
      [
        {
          eventType: 'payout_cash',
          driverId: driver,
          netAmount: 29976.26,
          date: '2026-08-04',
          platform: 'Uber',
          direction: 'inflow',
        },
        {
          eventType: 'fare_earning',
          driverId: driver,
          netAmount: 13720,
          date: '2026-08-04',
          platform: 'InDrive',
          paymentMethod: 'Cash',
          metadata: { cashCollected: 13720 },
        },
      ],
      [],
      [],
    ) as { period: { cashCollected: number } };
    expect(data.period.cashCollected).toBeCloseTo(43700, -2);
  });
});

describe('Engine D characterization — fleet cash calc is passenger-only', () => {
  it('does not add float into amountOwed', () => {
    const weeks = computeWeeklyCashSettlement({
      timezone: 'America/Jamaica',
      trips: [
        {
          id: 't1',
          date: '2026-08-04T12:00:00',
          platform: 'InDrive',
          amount: 1000,
          cashCollected: 1000,
          paymentMethod: 'Cash',
          status: 'Completed',
          driverId: 'd1',
        } as any,
      ],
      transactions: [
        {
          id: 'f1',
          date: '2026-08-04',
          category: 'Float Issue',
          amount: 500,
          type: 'Expense',
          status: 'Completed',
          driverId: 'd1',
        } as any,
      ],
      csvMetrics: [],
    });
    const week = weeks.find((w) => w.start.toISOString().slice(0, 10) <= '2026-08-04');
    expect(week).toBeTruthy();
    expect(week!.breakdown.floatIssued).toBeGreaterThanOrEqual(0);
    expect(week!.amountOwed).toBeCloseTo(1000, 0);
  });
});
