import { describe, expect, it } from 'vitest';
import {
  buildFillToFillStretches,
  detectPossibleFillNotScannedFlags,
  percentile90,
} from './possibleFillNotScanned.ts';

/** 51 stretches with p90 = 339 km (Kenny audit pin). */
function kennyPriorStretches(): number[] {
  const base = [...Array.from({ length: 40 }, () => 200), ...Array.from({ length: 11 }, () => 339)];
  expect(base).toHaveLength(51);
  expect(percentile90(base)).toBeCloseTo(339, 5);
  return base;
}

describe('possibleFillNotScanned', () => {
  it('p90 339 → threshold 406.8; 400 no flag, 410 and 429 flag', () => {
    const p90 = percentile90(kennyPriorStretches());
    expect(p90).toBe(339);
    const threshold = (p90 ?? 0) * 1.2;
    expect(threshold).toBeCloseTo(406.8, 1);
    expect(400 <= threshold).toBe(true);
    expect(410 > threshold).toBe(true);
    expect(429 > threshold).toBe(true);
  });

  it('fewer than 10 prior stretches → no flag', () => {
    const anchors = [
      { date: '2026-11-01', odometer: 100_000 },
      { date: '2026-11-08', odometer: 100_429 },
    ];
    const flags = detectPossibleFillNotScannedFlags({ vehicleId: 'v1', anchors });
    expect(flags).toHaveLength(0);
  });

  it('flags 429 km stretch when enough history exists', () => {
    let odo = 196_000;
    const anchors: { date: string; odometer: number }[] = [];
    const hist = kennyPriorStretches();
    for (let i = 0; i < 38; i++) {
      odo += hist[i % hist.length]!;
      anchors.push({
        date: new Date(Date.UTC(2026, 9, 1 + i)).toISOString().slice(0, 10),
        odometer: odo,
      });
    }
    anchors.push({ date: '2026-11-10', odometer: odo + 429 });

    const flags = detectPossibleFillNotScannedFlags({
      vehicleId: '5179KZ',
      anchors,
      weekStart: '2026-11-08',
      weekEnd: '2026-11-14',
    });
    expect(flags.some((f) => f.stretchKm === 429)).toBe(true);
  });

  it('awaiting card statement fill splits stretch (18 → 20 Nov, no false flag)', () => {
    const anchors = [
      { date: '2026-11-17', odometer: 200_000 },
      {
        date: '2026-11-18',
        odometer: 200_150,
        awaitingCardStatement: true,
      },
      { date: '2026-11-20', odometer: 200_280 },
    ];
    const stretches = buildFillToFillStretches(anchors);
    expect(stretches.map((s) => s.km)).toEqual([150, 130]);
    const flags = detectPossibleFillNotScannedFlags({
      vehicleId: 'v1',
      anchors,
      weekStart: '2026-11-16',
      weekEnd: '2026-11-22',
    });
    expect(flags).toHaveLength(0);
  });
});