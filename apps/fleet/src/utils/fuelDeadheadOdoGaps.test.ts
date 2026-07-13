import { describe, it, expect } from 'vitest';
import { sumOdoGapDeadheadKm } from './fuelDeadheadOdoGaps';

describe('sumOdoGapDeadheadKm', () => {
  it('sums positive odo gaps between consecutive trips', () => {
    expect(
      sumOdoGapDeadheadKm([
        {
          requestTime: '2026-07-06T10:00:00Z',
          dropoffTime: '2026-07-06T10:30:00Z',
          startOdometer: 1000,
          endOdometer: 1020,
        },
        {
          requestTime: '2026-07-06T11:00:00Z',
          dropoffTime: '2026-07-06T11:20:00Z',
          startOdometer: 1035,
          endOdometer: 1050,
        },
      ]),
    ).toBe(15);
  });

  it('ignores trips without odo and returns 0 when no gaps', () => {
    expect(
      sumOdoGapDeadheadKm([
        {
          requestTime: '2026-07-06T10:00:00Z',
          dropoffTime: '2026-07-06T10:30:00Z',
        },
        {
          requestTime: '2026-07-06T10:40:00Z',
          dropoffTime: '2026-07-06T11:00:00Z',
        },
      ]),
    ).toBe(0);
  });
});
