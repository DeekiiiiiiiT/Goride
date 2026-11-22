import { describe, expect, it } from 'vitest';
import {
  buildWeekEconomyRows,
  economyBand,
  economyDriftThreeWeeksRunning,
} from './fuelEconomyByWeek.ts';

describe('fuelEconomyByWeek', () => {
  it('uses KmLTracking worse bands at 15% and 30%', () => {
    expect(economyBand(10, 12)).toBe('watch');
    expect(economyBand(8, 12)).toBe('flagged');
    expect(economyBand(11.5, 12)).toBe('normal');
  });

  it('three weeks outside ±15% raises drift alert', () => {
    const rows = buildWeekEconomyRows({
      referenceKmPerLiter: 12,
      weeks: [
        { weekStart: '2026-10-26', kmPerLiter: 10 },
        { weekStart: '2026-11-02', kmPerLiter: 10.1 },
        { weekStart: '2026-11-09', kmPerLiter: 9.9 },
      ],
    });
    expect(economyDriftThreeWeeksRunning(rows)).toBe(true);
  });

  it('two bad weeks is not enough', () => {
    const rows = buildWeekEconomyRows({
      referenceKmPerLiter: 12,
      weeks: [
        { weekStart: '2026-11-02', kmPerLiter: 12.1 },
        { weekStart: '2026-11-09', kmPerLiter: 10 },
        { weekStart: '2026-11-16', kmPerLiter: 12 },
      ],
    });
    expect(economyDriftThreeWeeksRunning(rows)).toBe(false);
  });
});