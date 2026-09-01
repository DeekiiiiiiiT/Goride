import { describe, expect, it } from 'vitest';
import { filterLedgerEventsByServiceLineScope } from './filterLedgerByServiceLineScope';

describe('filterLedgerEventsByServiceLineScope', () => {
  const events = [
    { platform: 'Uber', eventType: 'fare_earning', date: '2026-01-01' },
    { platform: 'Roam Rush', eventType: 'fare_earning', date: '2026-01-02' },
  ];

  it('returns all events when scope is all', () => {
    expect(filterLedgerEventsByServiceLineScope(events, 'all')).toHaveLength(2);
  });

  it('filters rush delivery events', () => {
    expect(filterLedgerEventsByServiceLineScope(events, 'rush_delivery')).toHaveLength(1);
  });
});
