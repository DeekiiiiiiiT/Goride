import { describe, expect, it } from 'vitest';
import {
  buildMissedFillEntry,
  checkMissedFill,
  closedLine,
  dayLabel,
  daysWaitingText,
  diffText,
  economyChip,
  economyNeedsMoreWeeks,
  missedFillReady,
  stretchBars,
  type MissedFillDraft,
  type PossibleFillCheck,
} from './fuelChecksModel';

const stretch: PossibleFillCheck = {
  flagId: 'stretch:v1:2026-11-08:2026-11-10',
  vehicleId: 'v1',
  startDate: '2026-11-08',
  endDate: '2026-11-10',
  startOdometer: 196_429,
  endOdometer: 196_858,
  stretchKm: 429,
  p90Km: 290,
  closed: null,
};

const draft = (p: Partial<MissedFillDraft>): MissedFillDraft => ({
  date: '2026-11-09',
  amount: '',
  liters: '',
  odometer: '196640',
  paidWith: 'gas_card',
  note: '',
  ...p,
});

describe('fuelChecksModel', () => {
  it('writes days the way the screens do', () => {
    expect(dayLabel('2026-11-18')).toBe('Wed 18 Nov');
    expect(daysWaitingText(4)).toBe('4 days waiting');
    expect(daysWaitingText(1)).toBe('1 day waiting');
  });

  it('missed fill: date inside the stretch, odometer strictly between', () => {
    expect(missedFillReady(checkMissedFill(draft({}), stretch, { hasGasCard: true }))).toBe(true);
    expect(checkMissedFill(draft({ date: '2026-11-11' }), stretch, { hasGasCard: true }).date).toBe(
      'Must be between 8 Nov and 10 Nov',
    );
    expect(checkMissedFill(draft({ odometer: '196429' }), stretch, { hasGasCard: true }).odometer).toBe(
      'Must be between 196,429 and 196,858 km',
    );
    expect(checkMissedFill(draft({}), stretch, { hasGasCard: false }).card).toMatch(/no active gas card/);
  });

  it('missed fill: cash needs amount and litres', () => {
    const p = checkMissedFill(draft({ paidWith: 'cash' }), stretch, { hasGasCard: false });
    expect(p.amount).toBeTruthy();
    expect(p.liters).toBeTruthy();
    expect(p.card).toBeUndefined();
    expect(
      missedFillReady(checkMissedFill(draft({ paidWith: 'cash', amount: '4,000', liters: '20' }), stretch, { hasGasCard: false })),
    ).toBe(true);
  });

  it('a gas-card missed fill waits for the statement (no amount typed — never counted twice)', () => {
    const e = buildMissedFillEntry({ draft: draft({ note: 'Forgot to scan' }), vehicleId: 'v1', driverId: 'd1', cardId: 'c1', flagId: stretch.flagId, id: 'x' });
    expect(e.paymentSource).toBe('Gas_Card');
    expect(e.amount).toBe(0);
    expect(e.odometer).toBe(196_640);
    expect((e.metadata as Record<string, unknown>).awaitingCardStatement).toBe(true);
    expect((e.metadata as Record<string, unknown>).missedFillFlagId).toBe(stretch.flagId);
    expect(e.notes).toBe('Forgot to scan');
  });

  it('a cash missed fill is a cash-from-earnings fill with amount and litres', () => {
    const e = buildMissedFillEntry({
      draft: draft({ paidWith: 'cash', amount: '4000', liters: '20' }),
      vehicleId: 'v1',
      driverId: 'd1',
      flagId: stretch.flagId,
      id: 'y',
    });
    expect(e.paymentSource).toBe('RideShare_Cash');
    expect(e.amount).toBe(4000);
    expect(e.liters).toBe(20);
    expect(e.pricePerLiter).toBe(200);
    expect(String(e.date).slice(0, 10)).toBe('2026-11-09');
  });

  it('closed line names who and when', () => {
    const line = closedLine(
      { ...stretch, closed: { entryId: stretch.flagId, flagCode: 'possible_fill_not_scanned', note: 'Long trip to Negril', actorId: 'u1', at: '2026-11-22T15:00:00Z' } },
      { u1: 'Deeki T' },
    );
    expect(line).toBe('Closed by Deeki T, Sun 22 Nov: Long trip to Negril');
  });

  it('economy chips: Check when 15% better, bands when worse, none without data', () => {
    const row = (pct: number | null, band: 'normal' | 'watch' | 'flagged' | null) => ({
      weekStart: '2026-11-09',
      kmPerLiter: pct == null ? null : 12,
      referenceKmPerLiter: 12,
      pctVsUsual: pct,
      band,
    });
    expect(economyChip(row(15, 'normal'))?.text).toBe('Check');
    expect(economyChip(row(14, 'normal'))?.text).toBe('Normal');
    expect(economyChip(row(-20, 'watch'))?.text).toBe('Watch');
    expect(economyChip(row(-35, 'flagged'))?.text).toBe('Flagged');
    expect(economyChip(row(null, null))).toBeNull();
    expect(diffText(14.2)).toBe('+14%');
    expect(diffText(-3)).toBe('-3%');
    expect(diffText(0.3)).toBe('same');
    expect(economyNeedsMoreWeeks([row(1, 'normal'), row(null, null)])).toBe(true);
  });

  it('stretch bars mark the flagged stretch and give the average', () => {
    const r = stretchBars(
      [
        { vehicleId: 'v1', startDate: '2026-11-08', endDate: '2026-11-10', km: 429, flagged: true },
        { vehicleId: 'v1', startDate: '2026-11-10', endDate: '2026-11-13', km: 240, flagged: false },
        { vehicleId: 'v2', startDate: '2026-11-10', endDate: '2026-11-13', km: 999, flagged: false },
      ],
      'v1',
    );
    expect(r.bars.map((b) => [b.label, b.flagged, b.heightPct])).toEqual([
      ['Tue', true, 100],
      ['Fri', false, 56],
    ]);
    expect(r.averageKm).toBe(335);
  });
});
