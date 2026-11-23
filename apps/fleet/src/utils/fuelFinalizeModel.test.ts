import { describe, expect, it } from 'vitest';
import { parseSealRefusal, sealRefusalTitle, stillOpenRows, stillOpenText } from './fuelFinalizeModel';
import type { FuelWeekChecksResponse } from './fuelChecksModel';

const checks: FuelWeekChecksResponse = {
  periodId: 'p1',
  weekStart: '2026-11-16',
  weekEnd: '2026-11-22',
  locked: false,
  awaiting: [
    { entryId: 'a', vehicleId: 'v1', dateYmd: '2026-11-18', odometer: 198_973, amountSoFar: 0, daysWaiting: 4 },
    { entryId: 'b', vehicleId: 'v1', dateYmd: '2026-11-19', odometer: 199_231, amountSoFar: 0, daysWaiting: 3 },
  ],
  possibleFills: [
    {
      flagId: 'stretch:v1:2026-11-16:2026-11-18', vehicleId: 'v1', startDate: '2026-11-16', endDate: '2026-11-18',
      startOdometer: 198_500, endOdometer: 198_973, stretchKm: 473, p90Km: 290, closed: null,
    },
  ],
  stretches: [],
  actorNames: {},
};
const plateOf = (id: string) => (id === 'v1' ? '5179KZ' : id);

describe('fuelFinalizeModel', () => {
  it('turns the lock check into plain rows with car, dates and the part that fixes each', () => {
    const rows = stillOpenRows(
      [
        { code: 'awaiting_card_statement', message: '5179KZ on 2026-11-18 is waiting for the card statement.' },
        { code: 'awaiting_card_statement', message: '5179KZ on 2026-11-19 is waiting for the card statement.' },
        { code: 'possible_fill_not_scanned', message: 'Possible fill not scanned for 5179KZ (2026-11-16 → 2026-11-18).' },
        { code: 'gap_charge_recommended', message: 'Gap charge for 5179KZ (2026-11-19 → 2026-11-20) is recommended but not approved.' },
        { code: 'under_explained_unreviewed', message: 'Under-explained residual not reviewed' },
        { code: 'stop_to_stop_volume', message: 'Stop-to-stop volume conservation failed (bucket litres ≠ week ops litres)' },
        { code: 'stop_to_stop_chain', message: 'Stop-to-stop odometer chain has anomalies' },
        { code: 'degraded_inputs', message: 'x' },
        { code: 'missing_category_costs', message: 'y' },
      ],
      { checks, plateOf },
    );
    expect(rows.map((r) => [r.title, r.plate, r.detail, r.part])).toEqual([
      ['2 gas-card fills waiting for the card statement', '5179KZ', 'Wed 18 Nov, Thu 19 Nov', 'checks'],
      ['Possible fill not scanned', '5179KZ', 'Mon 16 Nov → Wed 18 Nov · 473 km with no fill', 'checks'],
      ['Gap charge not approved yet', '5179KZ', '19 Nov → 20 Nov', 'distance'],
      ['Distance and who pays not reviewed yet', undefined, undefined, 'distance'],
      ["A fill window's km don't add up", undefined, undefined, 'distance'],
      ["We couldn't load everything needed to lock this week. Refresh fuel and try again.", undefined, undefined, null],
    ]);
    const text = rows.map((r) => `${r.title} ${r.detail || ''}`).join(' ');
    for (const w of ['residual', 'conservation', 'exceeds tolerance', 'Texaco', 'categoryCosts']) expect(text).not.toContain(w);
  });

  it('keeps the gate sentence for blockers fixed outside this week', () => {
    const rows = stillOpenRows([{ code: 'prior_weeks_open', message: 'The week of 9 Nov is still open. Lock it first.' }], {
      checks: null,
      plateOf,
    });
    expect(rows).toEqual([
      { key: 'prior_weeks_open:The week of 9 Nov is still open. Lock it first.', tone: 'red', title: 'The week of 9 Nov is still open. Lock it first.', part: null },
    ]);
  });

  it('reads the saved refusal and names the drivers', () => {
    expect(parseSealRefusal('fuel_statement_failed:d1,d2')).toEqual({ phase: 'statement', driverIds: ['d1', 'd2'] });
    expect(parseSealRefusal('fuel_lines_failed')).toEqual({ phase: 'lines', driverIds: [] });
    expect(parseSealRefusal('seal missing')).toBeNull();
    expect(parseSealRefusal(null)).toBeNull();
    expect(sealRefusalTitle({ phase: 'statement', driverIds: ['d1'] }, ['Kenny'])).toBe(
      "Not locked — Kenny's fuel statement could not be written",
    );
    expect(sealRefusalTitle({ phase: 'statement', driverIds: ['d1', 'd2'] }, ['Kenny', 'Mark'])).toBe(
      "Not locked — 2 drivers' fuel statements could not be written",
    );
    expect(stillOpenText(3)).toBe('3 things still open');
  });
});
