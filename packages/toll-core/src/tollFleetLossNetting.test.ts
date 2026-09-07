import { describe, expect, it } from 'vitest';
import {
  computeTollFleetLossNetting,
  filterTollEventsInDateRange,
  hasCanonicalChargedToDriverEvents,
  sumTollChargedToDriversFromEvents,
  tollEventDate,
} from './tollFleetLossNetting.ts';

describe('tollEventDate — fleet-tz calendar day (one-week rule)', () => {
  it('keeps a late-UTC timestamp on the correct Jamaica day (W4)', () => {
    // 11:30pm UTC Aug 31 = 6:30pm Jamaica Aug 31 — must NOT roll to Sep 1.
    expect(tollEventDate({ date: '2026-08-31T23:30:00.000Z' })).toBe('2026-08-31');
  });

  it('passes a bare yyyy-MM-dd straight through', () => {
    expect(tollEventDate({ date: '2026-08-31' })).toBe('2026-08-31');
  });

  it('falls back through postingAt then createdAt', () => {
    expect(tollEventDate({ postingAt: '2026-07-01T12:00:00Z' })).toBe('2026-07-01');
    expect(tollEventDate({ createdAt: '2026-07-02' })).toBe('2026-07-02');
  });

  it('returns empty string for missing dates', () => {
    expect(tollEventDate({})).toBe('');
  });

  it('buckets the boundary event into the correct week via the range filter', () => {
    const events = [
      { eventType: 'toll_charge', sourceType: 'transaction', date: '2026-08-31T23:30:00.000Z', netAmount: -100 },
    ];
    // Week of Aug 31 (Mon) – Sep 6 (Sun): the event belongs here…
    expect(filterTollEventsInDateRange(events, '2026-08-31', '2026-09-06')).toHaveLength(1);
    // …and NOT in the following week, which a naive UTC slice would have done.
    expect(filterTollEventsInDateRange(events, '2026-09-07', '2026-09-13')).toHaveLength(0);
  });
});

describe('computeTollFleetLossNetting — signed rawNet', () => {
  it('exposes a positive rawNet equal to net when under-recovered', () => {
    const r = computeTollFleetLossNetting([
      { eventType: 'toll_charge', sourceType: 'transaction', netAmount: -500 },
      { eventType: 'toll_refund', netAmount: 200 },
    ]);
    expect(r.net).toBeCloseTo(300, 2);
    expect(r.rawNet).toBeCloseTo(300, 2);
    expect(r.clipped).toBe(false);
  });

  it('keeps rawNet negative (signed) but floors net at 0 when over-recovered', () => {
    const r = computeTollFleetLossNetting([
      { eventType: 'toll_charge', sourceType: 'transaction', netAmount: -100 },
      { eventType: 'toll_refund', netAmount: 250 },
    ]);
    expect(r.net).toBe(0);
    expect(r.rawNet).toBeCloseTo(-150, 2);
    expect(r.clipped).toBe(true);
  });
});

describe('sumTollChargedToDriversFromEvents — H-9 canonical wallet path', () => {
  it('sums charged minus reversed (signed, no floor)', () => {
    const events = [
      { eventType: 'toll_charged_to_driver', netAmount: -900 },
      { eventType: 'toll_charged_to_driver', netAmount: -100 },
      { eventType: 'toll_charge_reversed', netAmount: 250 },
    ];
    expect(sumTollChargedToDriversFromEvents(events)).toBeCloseTo(750, 2);
    expect(hasCanonicalChargedToDriverEvents(events)).toBe(true);
  });

  it('C-7: returns a SIGNED negative when reversals exceed charges (no $0 clamp)', () => {
    const events = [
      { eventType: 'toll_charged_to_driver', netAmount: -100 },
      { eventType: 'toll_charge_reversed', netAmount: 300 },
    ];
    // 100 charged − 300 reversed = −200 net credit back to drivers.
    expect(sumTollChargedToDriversFromEvents(events)).toBeCloseTo(-200, 2);
  });

  it('reports no canonical events when only fleet-loss events exist', () => {
    expect(hasCanonicalChargedToDriverEvents([{ eventType: 'toll_charge' }])).toBe(false);
    expect(sumTollChargedToDriversFromEvents([{ eventType: 'toll_charge' }])).toBe(0);
  });
});
