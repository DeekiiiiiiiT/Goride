import { describe, expect, it } from 'vitest';
import {
  filterActiveTollUsageEvents,
  reconcileTollUsageEventsVsLedger,
  tollEventLedgerHasDrift,
} from './tollEventLedgerRecon.ts';

describe('tollEventLedgerRecon', () => {
  it('flags orphans when source_id is missing from live ledger', () => {
    const recon = reconcileTollUsageEventsVsLedger(
      [
        { id: 'e1', source_id: 'live-1', amount_minor: -37000 },
        { id: 'e2', source_id: 'gone-1', amount_minor: -37000 },
        { id: 'e3', source_id: 'gone-2', amount_minor: -27500 },
      ],
      new Map([['live-1', { id: 'live-1', amountMajor: 370 }]]),
    );
    expect(recon.orphanCount).toBe(2);
    expect(recon.orphanAmountMajor).toBe(645);
    expect(recon.eventSpendMajor).toBe(1015);
    expect(recon.ledgerSpendMajor).toBe(370);
    expect(tollEventLedgerHasDrift(recon)).toBe(true);
  });

  it('ignores reversed / reversing events', () => {
    const active = filterActiveTollUsageEvents([
      { id: 'a', source_id: 't1', amount_minor: -10000 },
      { id: 'b', source_id: 't1', amount_minor: 10000, reverses_event_id: 'a' },
      { id: 'c', source_id: 't1', amount_minor: -10000, reversed_at: '2026-09-01' },
    ]);
    expect(active.map((e) => (e as { id: string }).id)).toEqual([]);
  });

  it('passes when events and live ledger tie with no orphans', () => {
    const recon = reconcileTollUsageEventsVsLedger(
      [
        { id: 'e1', source_id: 'a', amount_minor: -462000 },
        { id: 'e2', source_id: 'b', amount_minor: -64000 },
      ],
      {
        a: { id: 'a', amountMajor: 4620 },
        b: { id: 'b', amountMajor: 640 },
      },
    );
    expect(recon.orphanCount).toBe(0);
    expect(recon.eventSpendMajor).toBe(5260);
    expect(recon.ledgerSpendMajor).toBe(5260);
    expect(tollEventLedgerHasDrift(recon)).toBe(false);
  });
});
