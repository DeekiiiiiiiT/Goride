import { describe, expect, it } from 'vitest';
import {
  applyLoggedReceiptsToWeekCash,
  buildWeekCashSummaryByAnchor,
} from './settlementWeekCashSummary';

describe('buildWeekCashSummaryByAnchor', () => {
  it('sums passenger / returned / held per week', () => {
    const map = buildWeekCashSummaryByAnchor([
      {
        driverId: 'a',
        periodAnchor: '2026-09-07',
        cashCollected: 52000,
        cashReturned: 5000,
        cashStillHeld: 47000,
      },
      {
        driverId: 'b',
        periodAnchor: '2026-09-07',
        cashCollected: 1000,
        cashReturned: 0,
        cashStillHeld: 1000,
      },
      {
        driverId: 'a',
        periodAnchor: '2026-09-14',
        cashCollected: 10000,
        cashReturned: 2000,
        cashStillHeld: 8000,
      },
    ]);
    expect(map['2026-09-07'].passenger).toBeCloseTo(53000, 2);
    expect(map['2026-09-07'].returned).toBeCloseTo(5000, 2);
    expect(map['2026-09-07'].stillHeld).toBeCloseTo(48000, 2);
    expect(map['2026-09-14'].returned).toBeCloseTo(2000, 2);
  });

  it('derives returned when API omits cashReturned but passenger and held differ', () => {
    const map = buildWeekCashSummaryByAnchor([
      {
        periodAnchor: '2026-09-07',
        cashCollected: 52025.61,
        cashReturned: 0,
        cashStillHeld: 47575.61,
      },
    ]);
    expect(map['2026-09-07'].returned).toBeCloseTo(4450, 2);
  });

  it('falls back to returned+held when passenger cash missing', () => {
    const map = buildWeekCashSummaryByAnchor([
      { periodAnchor: '2026-01-12', cashReturned: 10, cashStillHeld: 0 },
    ]);
    expect(map['2026-01-12'].passenger).toBeCloseTo(10, 2);
    expect(map['2026-01-12'].returned).toBeCloseTo(10, 2);
  });

  it('does not double-count the same driver week across queues', () => {
    const map = buildWeekCashSummaryByAnchor([
      {
        driverId: 'd1',
        periodAnchor: '2026-09-07',
        cashCollected: 52000,
        cashReturned: 0,
        cashStillHeld: 47000,
      },
      {
        driverId: 'd1',
        periodAnchor: '2026-09-07',
        cashCollected: 52000,
        cashReturned: 5000,
        cashStillHeld: 47000,
      },
    ]);
    expect(map['2026-09-07'].passenger).toBeCloseTo(52000, 2);
    expect(map['2026-09-07'].returned).toBeCloseTo(5000, 2);
  });
});

describe('applyLoggedReceiptsToWeekCash', () => {
  it('raises returned to at least logged receipt total', () => {
    const map = applyLoggedReceiptsToWeekCash(
      {
        '2026-09-07': { passenger: 52025.61, returned: 0, stillHeld: 47575.61 },
      },
      { '2026-09-07': 5000 },
    );
    expect(map['2026-09-07'].returned).toBeCloseTo(5000, 2);
  });
});
