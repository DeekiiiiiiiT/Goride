import { describe, expect, it } from 'vitest';
import { computeWeeklyCashSettlement } from './cashSettlementCalc';
import type { FinancialTransaction, Trip } from '../types/data';

/**
 * Smoke: Kenny live-shaped tags — Jun 29 Cash Returned = $7,500 only;
 * Jul 2 $3k stays on Jun 22 week; Fuel Reimbursement excluded.
 */
describe('Kenny Cash Returned desk smoke', () => {
  const trip = (day: string, cash: number): Trip =>
    ({
      id: `t-${day}`,
      date: `${day}T12:00:00`,
      driverId: 'kenny',
      status: 'Completed',
      platform: 'InDrive',
      paymentMethod: 'Cash',
      cashCollected: cash,
      fare: cash,
      earnings: cash,
    }) as unknown as Trip;

  const cash = (
    id: string,
    amount: number,
    date: string,
    wpStart: string,
    wpEnd: string,
  ): FinancialTransaction =>
    ({
      id,
      driverId: 'kenny',
      date: `${date}T12:00:00`,
      description: 'Cash payment from driver',
      category: 'Cash Collection',
      type: 'Payment_Received',
      amount,
      status: 'Completed',
      paymentMethod: 'Cash',
      metadata: { workPeriodStart: wpStart, workPeriodEnd: wpEnd },
    }) as unknown as FinancialTransaction;

  it('tags Cash Returned by Settlement Week; fuel never pads', () => {
    const weeks = computeWeeklyCashSettlement({
      trips: [
        trip('2026-06-25', 10000),
        trip('2026-07-01', 62497.45),
      ],
      transactions: [
        cash('c7500', 7500, '2026-07-04', '2026-06-29', '2026-07-05'),
        cash('c3000', 3000, '2026-07-02', '2026-06-22', '2026-06-28'),
        {
          id: 'fuel2k',
          driverId: 'kenny',
          date: '2026-07-01T12:00:00',
          category: 'Fuel Reimbursement',
          type: 'Adjustment',
          amount: 2000,
          status: 'Completed',
          metadata: { workPeriodStart: '2026-06-29', workPeriodEnd: '2026-07-05' },
        } as unknown as FinancialTransaction,
        {
          id: 'fleet-fuel',
          driverId: 'kenny',
          date: '2026-07-01T12:00:00',
          category: 'Fuel Settlement Credit',
          type: 'Adjustment',
          amount: 21415.26,
          status: 'Completed',
          metadata: { reportId: 'veh_2026-06-29', companyShare: 21415.26 },
        } as unknown as FinancialTransaction,
      ],
      csvMetrics: [],
      excludeTollEffects: true,
    });

    const jun22 = weeks.find((w) => w.start.toISOString().startsWith('2026-06-22'));
    const jun29 = weeks.find((w) => w.start.toISOString().startsWith('2026-06-29'));

    expect(jun29?.amountPaid).toBeCloseTo(7500, 2);
    expect(jun22?.amountPaid).toBeCloseTo(3000, 2);
    expect(jun29?.breakdown.fuelCredits).toBe(0);
    expect(jun29?.weeklyFuelCredits).toBeCloseTo(21415.26, 2);
  });
});
