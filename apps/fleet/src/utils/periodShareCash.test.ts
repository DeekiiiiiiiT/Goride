import { describe, expect, it } from 'vitest';
import { computeWeekCommissionShare, computeWeekCashBase } from './periodShareCash';

describe('computeWeekCommissionShare', () => {
  const tiers = [
    { id: 't1', name: 'Bronze', minEarnings: 0, maxEarnings: 75000, sharePercentage: 25 },
    { id: 't2', name: 'Silver', minEarnings: 75000, maxEarnings: null, sharePercentage: 30 },
  ];

  it('applies tier % to week fare gross and includes tips in earningsGross', () => {
    const r = computeWeekCommissionShare({
      fareEntries: [
        { date: '2026-06-30', eventType: 'fare_earning', grossAmount: 10000 },
        { date: '2026-06-01', eventType: 'fare_earning', grossAmount: 80000 }, // MTD → Silver
      ],
      tipEntries: [{ date: '2026-07-01', eventType: 'tip', netAmount: 500 }],
      periodAnchor: '2026-06-29',
      periodEnd: '2026-07-05',
      tiers,
    });
    expect(r.grossRevenue).toBe(10000);
    expect(r.tips).toBe(500);
    expect(r.earningsGross).toBe(10500);
    expect(r.driverSharePercent).toBe(30);
    expect(r.driverShare).toBe(3000);
    expect(r.fleetShare).toBe(7000);
    expect(r.tripCount).toBe(1);
  });
});

describe('computeWeekCashBase', () => {
  it('sums Settlement-Week tagged Log Cash and non-Uber trip cash', () => {
    const r = computeWeekCashBase({
      periodAnchor: '2026-06-29',
      periodEnd: '2026-07-05',
      uberPayoutCash: 4000,
      trips: [
        {
          date: '2026-06-30T12:00:00.000Z',
          platform: 'InDrive',
          cashCollected: 800,
          paymentMethod: 'Cash',
        },
        {
          date: '2026-06-30T14:00:00.000Z',
          platform: 'Uber',
          cashCollected: 200,
          paymentMethod: 'Cash',
        },
      ],
      transactions: [
        {
          amount: 1500,
          category: 'Cash Collection',
          type: 'Payment_Received',
          paymentMethod: 'Cash',
          status: 'Completed',
          metadata: { workPeriodStart: '2026-06-29' },
        },
        {
          amount: 999,
          category: 'Cash Collection',
          type: 'Payment_Received',
          paymentMethod: 'Cash',
          status: 'Completed',
          metadata: { workPeriodStart: '2026-06-22' },
        },
      ],
    });
    expect(r.uberCash).toBe(4000);
    expect(r.nonUberTripCash).toBe(800);
    expect(r.passengerCash).toBe(4800);
    expect(r.cashReturned).toBe(1500);
  });
});
