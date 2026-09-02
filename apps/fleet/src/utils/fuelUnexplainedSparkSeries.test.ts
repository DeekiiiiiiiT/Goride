import { describe, expect, it } from 'vitest';
import {
  buildUnexplainedSparkSeries,
  unexplainedWowDelta,
} from './fuelUnexplainedSparkSeries';

describe('fuelUnexplainedSparkSeries', () => {
  it('returns chronological trailing series ending at week', () => {
    expect(
      buildUnexplainedSparkSeries(
        [
          { startDate: '2026-07-20', unexplained: 30 },
          { startDate: '2026-07-06', unexplained: 10 },
          { startDate: '2026-07-13', unexplained: 20 },
          { startDate: '2026-07-27', unexplained: 99 },
        ],
        '2026-07-20',
        6,
      ),
    ).toEqual([10, 20, 30]);
  });

  it('computes WoW delta', () => {
    expect(unexplainedWowDelta([10, 25])).toBe(15);
    expect(unexplainedWowDelta([10])).toBeNull();
  });
});
