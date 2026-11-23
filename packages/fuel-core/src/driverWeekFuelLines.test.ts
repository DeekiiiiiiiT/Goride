import { describe, expect, it } from 'vitest';
import { buildDriverWeekFuel, type DriverWeekLineRow } from './driverWeekFuelLines.ts';

const line = (p: Partial<DriverWeekLineRow>): DriverWeekLineRow => ({
  id: 'x',
  vehicle_id: 'v1',
  purpose: 'uber_trips',
  km: 1320,
  cost_per_km_minor: 1630.0732,
  driver_pct: 20,
  driver_amount_minor: 430_339,
  ...p,
});

describe('buildDriverWeekFuel', () => {
  it('screen 13: current lines, total, matches the statement', () => {
    const r = buildDriverWeekFuel({
      lines: [
        line({ id: 'a' }),
        line({ id: 'b', purpose: 'to_pickups', km: 150, driver_pct: 50, driver_amount_minor: 122_255 }),
        line({ id: 'c', purpose: 'unexplained_km', km: 15, driver_pct: 50, driver_amount_minor: 12_226 }),
      ],
      weekLocked: true,
      statementDriverMinor: 564_820,
    });
    expect(r.state).toBe('lines');
    expect(r.currentTotal).toBe(5648.2);
    expect(r.matches).toBe(true);
    expect(r.lines[0].costPerKm).toBeCloseTo(16.300732, 6);
    expect(r.reopened).toBeNull();
  });

  it('names a difference when the lines do not match the statement', () => {
    const r = buildDriverWeekFuel({ lines: [line({ id: 'a' })], weekLocked: true, statementDriverMinor: 430_000 });
    expect(r.matches).toBe(false);
    expect(r.statementDriverPays).toBe(4300);
  });

  it('screen 14: the reversed line sits right above the new one; total counts current lines only', () => {
    const r = buildDriverWeekFuel({
      lines: [
        line({ id: 'new-uber', km: 1300, driver_amount_minor: 423_819 }),
        line({ id: 'pick', purpose: 'to_pickups', km: 150, driver_pct: 50, driver_amount_minor: 122_255 }),
        line({ id: 'old-uber', reversed_at: '2026-11-24T14:12:00Z', reversed_by: 'u1' }),
        line({ id: 'old-pick', purpose: 'to_pickups', km: 150, driver_pct: 50, driver_amount_minor: 122_255, reversed_at: '2026-11-24T14:12:00Z', reversed_by: 'u1' }),
      ],
      weekLocked: true,
      statementDriverMinor: 546_074,
    });
    expect(r.lines.map((l) => [l.id, l.status])).toEqual([
      ['old-uber', 'reversed'],
      ['new-uber', 'current'],
      ['old-pick', 'reversed'],
      ['pick', 'current'],
    ]);
    expect(r.currentTotal).toBe(5460.74);
    expect(r.matches).toBe(true);
    expect(r.reopened).toEqual({ by: 'u1', at: '2026-11-24T14:12:00Z' });
  });

  it('old way and open weeks', () => {
    const old = buildDriverWeekFuel({ lines: [], weekLocked: true, statementDriverMinor: 408_136 });
    expect(old.state).toBe('old_way');
    expect(old.oldWayDeduction).toBe(4081.36);
    const open = buildDriverWeekFuel({
      lines: [line({ id: 'r', reversed_at: '2026-11-24T14:12:00Z', reversed_by: 'u1' })],
      weekLocked: false,
      statementDriverMinor: null,
    });
    expect(open.state).toBe('open');
    expect(open.lines.map((l) => l.status)).toEqual(['reversed']);
    expect(open.currentTotal).toBe(0);
    expect(open.matches).toBeNull();
  });
});
