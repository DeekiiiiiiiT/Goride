import { describe, expect, it } from 'vitest';
import { buildFuelWeekChecks, type WeekChecksFill } from './fuelWeekChecks.ts';

const V = 'veh-1';

/** 13 prior stretches of ~250 km (15 Sep – 11 Oct), then a 429 km stretch 8 → 10 Nov. */
function history(): WeekChecksFill[] {
  const out: WeekChecksFill[] = [];
  let odo = 193_000;
  const start = Date.parse('2026-09-15T12:00:00Z');
  for (let i = 0; i < 14; i++) {
    const d = new Date(start + i * 2 * 86_400_000).toISOString().slice(0, 10);
    out.push({ id: `f${i}`, date: d, odometer: odo, amount: 4000, vehicleId: V });
    odo += 240 + (i % 3) * 10;
  }
  return out;
}

describe('buildFuelWeekChecks', () => {
  it('lists card fills waiting for the statement in the week with days waiting', () => {
    const r = buildFuelWeekChecks({
      fills: [
        { id: 'a', date: '2026-11-18', odometer: 198_973, amount: 0, vehicleId: V, metadata: { awaitingCardStatement: true } },
        { id: 'b', date: '2026-11-19T10:00:00', odometer: 199_231, amount: 0, vehicleId: V, metadata: { awaitingCardStatement: true } },
        { id: 'c', date: '2026-11-15', odometer: 198_700, amount: 0, vehicleId: V, metadata: { awaitingCardStatement: true } },
        { id: 'd', date: '2026-11-17', odometer: 198_800, amount: 3500, vehicleId: V },
      ],
      weekStart: '2026-11-16',
      weekEnd: '2026-11-22',
      todayYmd: '2026-11-22',
      dispositions: [],
    });
    expect(r.awaiting.map((a) => [a.entryId, a.daysWaiting, a.odometer])).toEqual([
      ['a', 4, 198_973],
      ['b', 3, 199_231],
    ]);
  });

  it('never counts a card statement row as a fill', () => {
    const r = buildFuelWeekChecks({
      fills: [
        { id: 's', date: '2026-11-18', odometer: 1, amount: 5000, vehicleId: V, metadata: { importSource: 'jaa_raw', awaitingCardStatement: true } },
      ],
      weekStart: '2026-11-16',
      weekEnd: '2026-11-22',
      todayYmd: '2026-11-22',
      dispositions: [],
    });
    expect(r.awaiting).toEqual([]);
  });

  it('flags a long stretch, keeps the car p90, and marks it in the week stretches', () => {
    const fills = history();
    const last = fills[fills.length - 1];
    const lastOdo = Number(last.odometer);
    fills.push({ id: 'n8', date: '2026-11-08', odometer: lastOdo + 250, vehicleId: V });
    fills.push({ id: 'n10', date: '2026-11-10', odometer: lastOdo + 250 + 429, vehicleId: V });
    fills.push({ id: 'n13', date: '2026-11-13', odometer: lastOdo + 250 + 429 + 240, vehicleId: V });
    const r = buildFuelWeekChecks({
      fills,
      weekStart: '2026-11-09',
      weekEnd: '2026-11-15',
      todayYmd: '2026-11-22',
      dispositions: [],
    });
    expect(r.possibleFills).toHaveLength(1);
    const f = r.possibleFills[0];
    expect(f.stretchKm).toBe(429);
    expect(f.startDate).toBe('2026-11-08');
    expect(f.endDate).toBe('2026-11-10');
    expect(f.p90Km).toBeGreaterThan(240);
    expect(f.p90Km).toBeLessThan(429 / 1.2);
    expect(f.closed).toBeNull();
    expect(r.stretches.map((s) => [s.km, s.flagged])).toEqual([
      [429, true],
      [240, false],
    ]);
  });

  it('carries the close note when the flag was closed', () => {
    const fills = history();
    const lastOdo = Number(fills[fills.length - 1].odometer);
    fills.push({ id: 'n8', date: '2026-11-08', odometer: lastOdo + 250, vehicleId: V });
    fills.push({ id: 'n10', date: '2026-11-10', odometer: lastOdo + 250 + 429, vehicleId: V });
    const r = buildFuelWeekChecks({
      fills,
      weekStart: '2026-11-09',
      weekEnd: '2026-11-15',
      todayYmd: '2026-11-22',
      dispositions: [
        {
          entryId: `stretch:${V}:2026-11-08:2026-11-10`,
          flagCode: 'possible_fill_not_scanned',
          note: 'Long trip to Negril',
          actorId: 'u1',
          at: '2026-11-22T10:00:00Z',
        },
      ],
    });
    expect(r.possibleFills[0].closed?.note).toBe('Long trip to Negril');
  });
});
