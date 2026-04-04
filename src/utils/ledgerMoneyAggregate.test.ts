import { describe, expect, it } from 'vitest';
import {
  aggregateCanonicalEventsToLedgerDriverOverview,
  canonicalEventInSelectedWindow,
} from './ledgerMoneyAggregate';

const driver = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

describe('canonicalEventInSelectedWindow', () => {
  it('includes legacy statement/payout rows dated just after endDate when period fields are missing', () => {
    expect(
      canonicalEventInSelectedWindow(
        { eventType: 'statement_line', date: '2026-03-30' },
        '2026-03-23',
        '2026-03-29',
      ),
    ).toBe(true);
    expect(
      canonicalEventInSelectedWindow(
        { eventType: 'payout_bank', date: '2026-03-30' },
        '2026-03-23',
        '2026-03-29',
      ),
    ).toBe(true);
  });

  it('does not include statement rows dated beyond the grace window', () => {
    expect(
      canonicalEventInSelectedWindow(
        { eventType: 'statement_line', date: '2026-04-15' },
        '2026-03-23',
        '2026-03-29',
      ),
    ).toBe(false);
  });
});

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

  it('does not double-count cash when org statement payout_cash and trip fare_earning Cash both exist', () => {
    const period = [
      {
        eventType: 'statement_line',
        driverId: driver,
        netAmount: 100,
        direction: 'inflow',
        date: '2026-03-10',
        platform: 'Uber',
        metadata: { lineCode: 'NET_FARE' },
        periodStart: '2026-03-01',
        periodEnd: '2026-03-10',
      },
      {
        eventType: 'payout_cash',
        driverId: driver,
        netAmount: 5000,
        direction: 'inflow',
        date: '2026-03-10',
        platform: 'Uber',
        periodStart: '2026-03-01',
        periodEnd: '2026-03-10',
      },
      {
        eventType: 'fare_earning',
        driverId: driver,
        netAmount: 80,
        grossAmount: 80,
        direction: 'inflow',
        date: '2026-03-05',
        platform: 'Uber',
        paymentMethod: 'Cash',
        metadata: { cashCollected: 80 },
      },
    ];
    const data = aggregateCanonicalEventsToLedgerDriverOverview(period, [], [], undefined) as any;
    expect(data.period.cashCollected).toBe(5000);
    expect(data.platformStats.Uber.cashCollected).toBe(5000);
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
