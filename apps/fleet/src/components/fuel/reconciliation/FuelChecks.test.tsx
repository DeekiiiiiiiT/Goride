/**
 * @vitest-environment jsdom
 * Part J screens 4–8 — what is shown, the actions, and that Stitch's invented words are not.
 */
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { FuelWeekChecksResponse, VehicleEconomyResponse } from '../../../utils/fuelChecksModel';

const { getFuelWeekChecks, reopenFuelFlagDisposition, getVehicleEconomyWeeks, upsertFuelFlagDisposition, saveFuelEntry } =
  vi.hoisted(() => ({
    getFuelWeekChecks: vi.fn(),
    reopenFuelFlagDisposition: vi.fn(async () => ({ ok: true })),
    getVehicleEconomyWeeks: vi.fn(),
    upsertFuelFlagDisposition: vi.fn(async () => ({ ok: true })),
    saveFuelEntry: vi.fn(async (e: unknown) => e),
  }));

vi.mock('../../../services/api', () => ({
  api: {
    getFuelWeekChecks: (...a: unknown[]) => getFuelWeekChecks(...a),
    reopenFuelFlagDisposition: (...a: unknown[]) => reopenFuelFlagDisposition(...(a as [])),
    getVehicleEconomyWeeks: (...a: unknown[]) => getVehicleEconomyWeeks(...a),
    upsertFuelFlagDisposition: (...a: unknown[]) => upsertFuelFlagDisposition(...(a as [])),
  },
}));
vi.mock('../../../services/fuelService', () => ({
  fuelService: {
    getFuelCards: vi.fn(async () => []),
    saveFuelEntry: (...a: unknown[]) => saveFuelEntry(...(a as [unknown])),
  },
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { FuelChecksSection } from './FuelChecks';

const CAR = { vehicleId: 'v1', plate: '5179KZ', makeModel: 'Toyota Roomy', driverId: 'd1', driverName: 'Kenny Gregory Rattray' };
const CARD = { id: 'card-1', status: 'Active', assignedVehicleId: 'v1' };

const base: FuelWeekChecksResponse = {
  periodId: 'p1',
  weekStart: '2026-11-16',
  weekEnd: '2026-11-22',
  locked: false,
  awaiting: [],
  possibleFills: [],
  stretches: [],
  actorNames: {},
};

const waiting = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    entryId: `w${i}`,
    vehicleId: 'v1',
    dateYmd: `2026-11-${18 + i}`,
    odometer: 198_973 + i * 250,
    amountSoFar: 0,
    daysWaiting: 4 - i,
  }));

const possible = {
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

const economy: VehicleEconomyResponse = {
  vehicleId: 'v1',
  weekStart: '2026-11-09',
  referenceKmPerLiter: 12,
  economyDriftAlert: false,
  weeks: [
    { weekStart: '2026-11-02', kmPerLiter: 11.7, referenceKmPerLiter: 12, pctVsUsual: -2.5, band: 'normal' },
    { weekStart: '2026-11-09', kmPerLiter: 13.7, referenceKmPerLiter: 12, pctVsUsual: 14.2, band: 'normal' },
  ],
};

function renderPart(checks: FuelWeekChecksResponse, extra: Partial<React.ComponentProps<typeof FuelChecksSection>> = {}) {
  getFuelWeekChecks.mockResolvedValue(checks);
  return render(
    <FuelChecksSection
      periodId="p1"
      weekStart={checks.weekStart}
      locked={checks.locked}
      cars={[CAR]}
      otherFills={{ count: 6, total: 14_500 }}
      fuelCards={[CARD as never]}
      {...extra}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  getVehicleEconomyWeeks.mockResolvedValue(economy);
});

describe('Fuel checks (Part J screens 4–8)', () => {
  it('screen 4: two card fills waiting, upload, the red can’t-lock line, other fills', async () => {
    const onUpload = vi.fn();
    renderPart({ ...base, awaiting: waiting(2) }, { onUploadCardStatement: onUpload });
    const card = await screen.findByTestId('checks-awaiting');
    expect(within(card).getByText('2 gas-card fills are waiting for the card statement')).toBeTruthy();
    expect(within(card).getByText(/Kenny scanned these at the pump/)).toBeTruthy();
    const rows = within(card).getAllByTestId('checks-awaiting-row');
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('Wed 18 Nov');
    expect(rows[0].textContent).toContain('odometer 198,973 km');
    expect(rows[0].textContent).toContain('4 days waiting');
    expect(within(card).getByText(/can't lock until these are priced/)).toBeTruthy();
    await userEvent.click(within(card).getByRole('button', { name: /Upload card statement/ }));
    expect(onUpload).toHaveBeenCalled();
    const other = screen.getByTestId('checks-other-fills');
    expect(other.textContent).toContain('Other fills');
    expect(other.textContent).toContain('6 fills');
    expect(other.textContent).toContain('all checked');
  });

  it('screen 4: three or more waiting fills show as one row that opens', async () => {
    renderPart({ ...base, awaiting: waiting(3) });
    const group = await screen.findByTestId('checks-awaiting-group');
    expect(group.textContent).toContain('3 card fills waiting for the statement');
    expect(screen.queryAllByTestId('checks-awaiting-row')).toHaveLength(0);
    await userEvent.click(group);
    expect(screen.getAllByTestId('checks-awaiting-row')).toHaveLength(3);
  });

  it('screen 5 + 7: possible fill not scanned, closed with a note of 10+ characters', async () => {
    const onChanged = vi.fn();
    renderPart({ ...base, weekStart: '2026-11-09', weekEnd: '2026-11-15', possibleFills: [possible] }, { onChanged });
    const card = await screen.findByTestId('checks-possible-fill');
    expect(card.textContent).toContain('Sun 8 Nov at 196,429 km → Tue 10 Nov at 196,858 km');
    expect(card.textContent).toContain('429 km with no fill');
    expect(card.textContent).toContain('usually up to 290 km');
    expect(card.textContent).toContain('Nothing is charged for it');
    await userEvent.click(within(card).getByRole('button', { name: 'Close with a note' }));
    const dialog = await screen.findByTestId('close-with-note');
    const save = within(dialog).getByRole('button', { name: 'Close with note' }) as HTMLButtonElement;
    await userEvent.type(within(dialog).getByLabelText('Why'), 'Too short');
    expect(save.disabled).toBe(true);
    await userEvent.type(within(dialog).getByLabelText('Why'), '!');
    expect(save.disabled).toBe(false);
    await userEvent.click(save);
    await waitFor(() =>
      expect(upsertFuelFlagDisposition).toHaveBeenCalledWith({
        entryId: possible.flagId,
        flagCode: 'possible_fill_not_scanned',
        action: 'accepted',
        note: 'Too short!',
        periodId: 'p1',
      }),
    );
    expect(onChanged).toHaveBeenCalled();
  });

  it('screen 5: a closed check is a grey row with who, when and Reopen; locked weeks are read-only', async () => {
    const closed = {
      ...possible,
      closed: { entryId: possible.flagId, flagCode: 'possible_fill_not_scanned', note: 'Long trip to Negril on Uber', actorId: 'u1', at: '2026-11-22T15:00:00Z' },
    };
    const { unmount } = renderPart({ ...base, possibleFills: [closed], actorNames: { u1: 'Deeki T' } });
    const row = await screen.findByTestId('checks-closed-row');
    expect(row.textContent).toContain('Closed by Deeki T, Sun 22 Nov: Long trip to Negril on Uber');
    expect(screen.queryByTestId('checks-possible-fill')).toBeNull();
    await userEvent.click(within(row).getByRole('button', { name: 'Reopen' }));
    await waitFor(() =>
      expect(reopenFuelFlagDisposition).toHaveBeenCalledWith({
        entryId: possible.flagId,
        flagCode: 'possible_fill_not_scanned',
        periodId: 'p1',
      }),
    );
    unmount();
    renderPart({ ...base, locked: true, possibleFills: [closed, { ...possible, flagId: 'x' }], actorNames: { u1: 'Deeki T' } });
    await screen.findByTestId('checks-closed-row');
    expect(screen.queryByRole('button', { name: 'Reopen' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Add fill/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Close with a note' })).toBeNull();
  });

  it('screen 6: add a missed fill — gas card waits for the statement, bounds enforced', async () => {
    renderPart({ ...base, possibleFills: [possible] });
    const card = await screen.findByTestId('checks-possible-fill');
    await userEvent.click(within(card).getByRole('button', { name: /Add fill/ }));
    const panel = await screen.findByTestId('add-missed-fill');
    expect(panel.textContent).toContain('Between Sun 8 Nov (196,429 km) and Tue 10 Nov (196,858 km)');
    expect(within(panel).getByTestId('missed-fill-card-amount').textContent).toContain('comes from the gas card statement');
    const add = within(panel).getByRole('button', { name: /Add fill/ }) as HTMLButtonElement;
    expect(add.disabled).toBe(true);
    await userEvent.type(within(panel).getByLabelText('Odometer'), '196900');
    expect(add.disabled).toBe(true);
    expect(panel.textContent).toContain('Must be between 196,429 and 196,858 km');
    await userEvent.clear(within(panel).getByLabelText('Odometer'));
    await userEvent.type(within(panel).getByLabelText('Odometer'), '196640');
    expect(add.disabled).toBe(false);
    await userEvent.click(add);
    await waitFor(() => expect(saveFuelEntry).toHaveBeenCalled());
    const saved = saveFuelEntry.mock.calls[0][0] as { paymentSource: string; amount: number; odometer: number; cardId: string; metadata: Record<string, unknown> };
    expect(saved.paymentSource).toBe('Gas_Card');
    expect(saved.amount).toBe(0);
    expect(saved.odometer).toBe(196_640);
    expect(saved.cardId).toBe('card-1');
    expect(saved.metadata.awaitingCardStatement).toBe(true);
  });

  it('screen 8: car economy row and the 8-week panel', async () => {
    renderPart({ ...base, weekStart: '2026-11-09' });
    const section = await screen.findByTestId('checks-car-economy');
    await waitFor(() => expect(section.textContent).toContain('13.7 km per litre'));
    await userEvent.click(within(section).getByRole('button', { name: /See 8 weeks/ }));
    const panel = await screen.findByTestId('car-economy');
    const rows = within(panel).getAllByTestId('car-economy-row');
    expect(rows[0].textContent).toContain('9 Nov');
    expect(rows[0].textContent).toContain('+14%');
    expect(rows[0].textContent).toContain('Normal');
    expect(panel.textContent).toContain('A week much better than usual often means a fill was not scanned');
  });

  it('never shows the words Stitch made up', async () => {
    const { container } = renderPart({ ...base, awaiting: waiting(2), possibleFills: [possible] });
    await screen.findByTestId('checks-awaiting');
    const text = container.ownerDocument.body.textContent || '';
    for (const w of [
      'Verified', 'slips', 'Auditing', 'Weekly consumption', 'telematics', 'Telematics', 'GPS', 'receipt', 'Receipt',
      '185–340', 'Overall progress', 'Active Range', 'Petrojam', 'Texaco', 'Check spike', 'Open car record',
    ]) {
      expect(text).not.toContain(w);
    }
  });
});
