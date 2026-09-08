import { describe, expect, it } from 'vitest';
import { mergeDoneCashHistory } from './settlementDoneHistory';

describe('mergeDoneCashHistory', () => {
  const isCleared = (t: { status?: string }) => {
    const s = String(t.status || '').toLowerCase();
    return s === 'completed' || s === 'verified';
  };

  it('shows Cash Collection txs even when a void settlement_movement exists', () => {
    const rows = mergeDoneCashHistory({
      direction: 'collect',
      movements: [
        {
          id: 'mov-void',
          kind: 'collect',
          driverId: 'd1',
          amount: 1300,
          status: 'void',
          periodAnchor: '2026-08-31',
        },
      ],
      legacyTxs: [
        {
          id: 'tx-1',
          driverId: 'd1',
          driverName: 'Kenny',
          amount: 10000,
          status: 'Completed',
          date: '2026-08-08',
          metadata: { workPeriodStart: '2026-08-03' },
        },
      ],
      weekFrom: '2026-01-01',
      weekTo: '2026-09-13',
      isClearedTx: isCleared,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe('tx-1');
    expect(rows[0].amount).toBe(10000);
    expect(rows[0].periodAnchor).toBe('2026-08-03');
    expect(rows[0].periodEnd).toBe('2026-08-09');
  });

  it('dedupes when movement already links sourceTransactionId', () => {
    const rows = mergeDoneCashHistory({
      direction: 'collect',
      movements: [
        {
          id: 'mov-1',
          kind: 'collect',
          driverId: 'd1',
          amount: 5000,
          status: 'posted',
          periodAnchor: '2026-08-03',
          sourceTransactionId: 'tx-1',
          date: '2026-08-08',
        },
      ],
      legacyTxs: [
        {
          id: 'tx-1',
          driverId: 'd1',
          amount: 5000,
          status: 'Completed',
          date: '2026-08-08',
          metadata: { workPeriodStart: '2026-08-03' },
        },
      ],
      weekFrom: '2026-01-01',
      weekTo: '2026-09-13',
      isClearedTx: isCleared,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe('mov-1');
  });

  it('unions posted movements with other cash logs', () => {
    const rows = mergeDoneCashHistory({
      direction: 'collect',
      movements: [
        {
          id: 'mov-1',
          kind: 'collect',
          driverId: 'd1',
          amount: 100,
          status: 'posted',
          periodAnchor: '2026-08-24',
          date: '2026-09-06',
        },
      ],
      legacyTxs: [
        {
          id: 'tx-2',
          driverId: 'd1',
          amount: 200,
          status: 'Completed',
          date: '2026-08-21',
          metadata: { workPeriodStart: '2026-08-03' },
        },
      ],
      weekFrom: '2026-01-01',
      weekTo: '2026-09-13',
      isClearedTx: isCleared,
    });
    expect(rows.map((r) => r.id).sort()).toEqual(['mov-1', 'tx-2']);
  });
});
