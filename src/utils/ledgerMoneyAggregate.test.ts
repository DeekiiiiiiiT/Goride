import { describe, expect, it } from 'vitest';
import { aggregateCanonicalEventsToLedgerDriverOverview } from '../supabase/functions/server/ledger_money_aggregate.ts';

const driver = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

describe('aggregateCanonicalEventsToLedgerDriverOverview', () => {
  it('rolls up Uber statement_line into period earnings without double-counting fare_earning', () => {
    const period = [
      {
        eventType: 'statement_line',
        driverId: driver,
        netAmount: 50,
        direction: 'inflow',
        date: '2026-03-05',
        platform: 'Uber',
        metadata: { lineCode: 'NET_FARE' },
      },
      {
        eventType: 'statement_line',
        driverId: driver,
        netAmount: 10,
        direction: 'inflow',
        date: '2026-03-05',
        platform: 'Uber',
        metadata: { lineCode: 'TIPS' },
      },
      {
        eventType: 'fare_earning',
        driverId: driver,
        netAmount: 40,
        grossAmount: 40,
        direction: 'inflow',
        date: '2026-03-05',
        platform: 'Uber',
        paymentMethod: 'Digital Wallet',
      },
    ];
    const data = aggregateCanonicalEventsToLedgerDriverOverview(period, [], [], undefined) as any;
    expect(data.period.earnings).toBe(60);
    expect(data.period.tripCount).toBe(1);
    expect(data.period.uber.fareComponents).toBe(50);
    expect(data.period.uber.tips).toBe(10);
    expect(data.readModelSource).toBe('canonical_events');
  });

  it('sums InDrive fare_earning when no Uber statement lines', () => {
    const period = [
      {
        eventType: 'fare_earning',
        driverId: driver,
        netAmount: 25,
        grossAmount: 30,
        direction: 'inflow',
        date: '2026-03-05',
        platform: 'InDrive',
      },
    ];
    const data = aggregateCanonicalEventsToLedgerDriverOverview(period, [], [], undefined) as any;
    expect(data.period.earnings).toBe(25);
    expect(data.platformStats.InDrive.earnings).toBe(25);
  });

  it('includes toll_support_adjustment in earnings and disputeRefunds', () => {
    const period = [
      {
        eventType: 'toll_support_adjustment',
        driverId: driver,
        netAmount: 12,
        direction: 'inflow',
        date: '2026-03-06',
        platform: 'Uber',
      },
    ];
    const data = aggregateCanonicalEventsToLedgerDriverOverview(period, [], [], undefined) as any;
    expect(data.period.earnings).toBe(12);
    expect(data.period.disputeRefunds).toBe(12);
  });
});
