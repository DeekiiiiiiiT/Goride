import { describe, expect, it } from 'vitest';
import { snapshotsFromCanonicalLedgerEvents } from './snapshotsFromCanonicalLedgerEvents';

describe('snapshotsFromCanonicalLedgerEvents', () => {
  it('merges statement_line and payouts into UberStatementSnapshot rows', () => {
    const driverId = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
    const events = [
      {
        eventType: 'statement_line',
        driverId,
        netAmount: 500,
        direction: 'inflow' as const,
        date: '2026-03-07',
        periodStart: '2026-03-01',
        periodEnd: '2026-03-07',
        metadata: { lineCode: 'NET_FARE' },
      },
      {
        eventType: 'statement_line',
        driverId,
        netAmount: 3,
        direction: 'outflow' as const,
        date: '2026-03-07',
        periodStart: '2026-03-01',
        periodEnd: '2026-03-07',
        metadata: { lineCode: 'REFUNDS_EXPENSES' },
      },
      {
        eventType: 'payout_cash',
        driverId,
        netAmount: 40,
        direction: 'inflow' as const,
        date: '2026-03-07',
        periodStart: '2026-03-01',
        periodEnd: '2026-03-07',
      },
    ];
    const snaps = snapshotsFromCanonicalLedgerEvents(events);
    expect(snaps).toHaveLength(1);
    expect(snaps[0].netFareStatement).toBe(500);
    expect(snaps[0].refundsAndExpenses).toBe(3);
    expect(snaps[0].cashCollected).toBe(40);
  });
});
