import { describe, expect, it } from 'vitest';
import type { LedgerDriverOverview } from '../types/data';
import { mapLedgerDriverOverviewToUberStatementSummary } from './mapLedgerDriverOverviewToUberStatementSummary';

function baseOverview(over: Partial<LedgerDriverOverview> = {}): LedgerDriverOverview {
  return {
    period: {
      earnings: 0,
      cashCollected: 0,
      tolls: 0,
      tips: 0,
      baseFare: 0,
      platformFees: 0,
      tripCount: 0,
      cancelledCount: 0,
      ...over.period,
    },
    prevPeriod: { earnings: 0 },
    lifetime: {
      earnings: 0,
      tripCount: 0,
      cashCollected: 0,
      tolls: 0,
    },
    platformStats: {},
    dailyEarnings: [],
    ...over,
  } as LedgerDriverOverview;
}

describe('mapLedgerDriverOverviewToUberStatementSummary', () => {
  it('returns null when period.uber is missing', () => {
    const o = baseOverview();
    expect(mapLedgerDriverOverviewToUberStatementSummary(o, '2026-03-23', '2026-03-29')).toBeNull();
  });

  it('maps fare, promotions, tips, refunds split, payout (tolls from refunds − dispute when platform tolls zero)', () => {
    const o = baseOverview({
      period: {
        earnings: 0,
        cashCollected: 0,
        bankTransferred: -51860.53,
        tolls: 0,
        tips: 0,
        baseFare: 0,
        platformFees: 0,
        tripCount: 83,
        cancelledCount: 0,
        disputeRefunds: 10,
        uber: {
          fareComponents: 81558.73,
          tips: 1600,
          priorPeriodAdjustments: 160,
          promotions: 197.23,
          refundExpense: 1395,
          netEarnings: 0,
          /** Matches fare+promo+tips+prior so modal keeps full tips line (see OverviewMetricsGrid). */
          statementTotalEarnings: 83515.96,
        },
      },
      platformStats: {
        Uber: {
          earnings: 83478.73,
          tripCount: 83,
          cashCollected: 33013.2,
          tolls: 0,
        },
      },
    });

    const s = mapLedgerDriverOverviewToUberStatementSummary(o, '2026-03-23', '2026-03-29');
    expect(s).not.toBeNull();
    expect(s!.netFare).toBe(81558.73);
    expect(s!.promotions).toBe(197.23);
    expect(s!.periodAdjustments).toBe(160);
    expect(s!.tolls).toBe(1385);
    expect(s!.tollAdjustments).toBe(10);
    expect(s!.totalRefundsExpenses).toBe(1395);
    expect(s!.cashCollected).toBe(33013.2);
    expect(s!.bankTransfer).toBe(51860.53);
    expect(s!.totalPayout).toBe(84873.73);
    expect(s!.tripCount).toBe(83);
    expect(s!.totalEarnings).toBe(83355.96);
  });

  it('uses platformStats.Uber.tolls when present instead of refunds − dispute', () => {
    const o = baseOverview({
      period: {
        earnings: 0,
        cashCollected: 0,
        tolls: 0,
        tips: 0,
        baseFare: 0,
        platformFees: 0,
        tripCount: 1,
        cancelledCount: 0,
        disputeRefunds: 10,
        uber: {
          fareComponents: 100,
          tips: 20,
          priorPeriodAdjustments: 0,
          promotions: 5,
          refundExpense: 50,
          netEarnings: 0,
        },
      },
      platformStats: {
        Uber: {
          earnings: 125,
          tripCount: 1,
          cashCollected: 0,
          tolls: 40,
        },
      },
    });
    const s = mapLedgerDriverOverviewToUberStatementSummary(o, '2026-01-01', '2026-01-07');
    expect(s!.tolls).toBe(40);
    expect(s!.tollAdjustments).toBe(10);
    expect(s!.totalRefundsExpenses).toBe(50);
  });
});
