import { describe, expect, it } from 'vitest';
import {
  buildFixedExpenseOccurrences,
  computeFixedExpenseVersionTag,
} from './fixedExpenseOccurrences';
import type { FixedExpenseConfig } from '../types/expenses';

function cfg(over: Partial<FixedExpenseConfig> = {}): FixedExpenseConfig {
  return {
    id: 'cfg1',
    vehicleId: 'veh1',
    name: 'Comprehensive Insurance',
    category: 'Insurance',
    amount: 100,
    currency: 'JMD',
    frequency: 'monthly',
    startDate: '2026-01-15',
    ...over,
  };
}

describe('buildFixedExpenseOccurrences', () => {
  it('emits monthly occurrences on the anchored day within the window', () => {
    const occ = buildFixedExpenseOccurrences(cfg(), '2026-01-01', '2026-03-31');
    expect(occ.map((o) => o.occurrenceYmd)).toEqual(['2026-01-15', '2026-02-15', '2026-03-15']);
    expect(occ.every((o) => o.amount === 100)).toBe(true);
    expect(occ.every((o) => o.category === 'Insurance')).toBe(true);
  });

  it('clamps month-end anchored days (Jan 31 -> Feb 28) from the original start', () => {
    const occ = buildFixedExpenseOccurrences(
      cfg({ startDate: '2026-01-31' }),
      '2026-01-01',
      '2026-03-31',
    );
    expect(occ.map((o) => o.occurrenceYmd)).toEqual(['2026-01-31', '2026-02-28', '2026-03-31']);
  });

  it('excludes occurrences before the config start date', () => {
    const occ = buildFixedExpenseOccurrences(cfg({ startDate: '2026-02-15' }), '2026-01-01', '2026-03-31');
    expect(occ.map((o) => o.occurrenceYmd)).toEqual(['2026-02-15', '2026-03-15']);
  });

  it('respects the config end date', () => {
    const occ = buildFixedExpenseOccurrences(
      cfg({ endDate: '2026-02-20' }),
      '2026-01-01',
      '2026-12-31',
    );
    expect(occ.map((o) => o.occurrenceYmd)).toEqual(['2026-01-15', '2026-02-15']);
  });

  it('handles one_time as a single dated occurrence', () => {
    const occ = buildFixedExpenseOccurrences(
      cfg({ frequency: 'one_time', startDate: '2026-02-10' }),
      '2026-01-01',
      '2026-12-31',
    );
    expect(occ.map((o) => o.occurrenceYmd)).toEqual(['2026-02-10']);
  });

  it('handles quarterly and annually', () => {
    const q = buildFixedExpenseOccurrences(
      cfg({ frequency: 'quarterly', startDate: '2026-01-10' }),
      '2026-01-01',
      '2026-12-31',
    );
    expect(q.map((o) => o.occurrenceYmd)).toEqual([
      '2026-01-10',
      '2026-04-10',
      '2026-07-10',
      '2026-10-10',
    ]);

    const y = buildFixedExpenseOccurrences(
      cfg({ frequency: 'annually', startDate: '2025-06-01' }),
      '2025-01-01',
      '2027-12-31',
    );
    expect(y.map((o) => o.occurrenceYmd)).toEqual(['2025-06-01', '2026-06-01', '2027-06-01']);
  });

  it('normalizes legacy casing and synonyms', () => {
    const occ = buildFixedExpenseOccurrences(
      cfg({ frequency: 'Monthly' as never, category: 'Tracking' }),
      '2026-01-01',
      '2026-02-28',
    );
    expect(occ).toHaveLength(2);
    expect(occ[0].category).toBe('Security'); // Tracking -> Security
  });

  it('produces nothing for inactive / non-positive amounts', () => {
    expect(buildFixedExpenseOccurrences(cfg({ isActive: false }), '2026-01-01', '2026-12-31')).toHaveLength(0);
    expect(buildFixedExpenseOccurrences(cfg({ amount: 0 }), '2026-01-01', '2026-12-31')).toHaveLength(0);
    expect(buildFixedExpenseOccurrences(cfg({ amount: -50 }), '2026-01-01', '2026-12-31')).toHaveLength(0);
  });

  it('idempotency keys are stable and unique per occurrence', () => {
    const a = buildFixedExpenseOccurrences(cfg(), '2026-01-01', '2026-03-31');
    const b = buildFixedExpenseOccurrences(cfg(), '2026-01-01', '2026-03-31');
    expect(a.map((o) => o.idempotencyKey)).toEqual(b.map((o) => o.idempotencyKey));
    expect(new Set(a.map((o) => o.idempotencyKey)).size).toBe(a.length);
  });

  it('version tag changes when amount changes (forces re-post on edit)', () => {
    const before = computeFixedExpenseVersionTag(cfg({ amount: 100 }));
    const after = computeFixedExpenseVersionTag(cfg({ amount: 120 }));
    expect(before).not.toBe(after);
  });
});
