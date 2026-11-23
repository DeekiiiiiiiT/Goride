/**
 * @vitest-environment jsdom
 * Part J screens 13, 14 — the driver's fuel lines in Driver Settlements.
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { buildDriverWeekFuel, type DriverWeekLineRow } from '@roam/fuel-core';
import { DriverWeekFuelCard } from './DriverWeekFuelCard';
import type { DriverWeekFuelResponse } from '../../utils/driverFuelLinesModel';

vi.mock('../../services/api', () => ({ api: { getDriverWeekFuelLines: vi.fn() } }));

const line = (p: Partial<DriverWeekLineRow>): DriverWeekLineRow => ({
  id: 'x', vehicle_id: 'v1', purpose: 'uber_trips', km: 1320, cost_per_km_minor: 1630.0732, driver_pct: 20,
  driver_amount_minor: 430_339, ...p,
});

function respond(lines: DriverWeekLineRow[], weekLocked: boolean, statementDriverMinor: number | null): DriverWeekFuelResponse {
  return {
    ...buildDriverWeekFuel({ lines, weekLocked, statementDriverMinor }),
    driverId: 'kenny',
    weekStart: '2026-11-16',
    plates: { v1: '5179KZ' },
    actorNames: { u1: 'Deeki T' },
  };
}

const screen13 = [
  line({ id: 'a' }),
  line({ id: 'b', purpose: 'to_pickups', km: 150, driver_pct: 50, driver_amount_minor: 122_255 }),
  line({ id: 'c', purpose: 'unexplained_km', km: 15, driver_pct: 50, driver_amount_minor: 12_226 }),
];

describe('Driver Settlements fuel lines (Part J screens 13, 14)', () => {
  it('screen 13: one row per kind of driving, the total, matches the statement, View week', async () => {
    const onViewWeek = vi.fn();
    render(
      <DriverWeekFuelCard driverId="kenny" weekStart="2026-11-16" onViewWeek={onViewWeek} load={async () => respond(screen13, true, 564_820)} />,
    );
    const card = await screen.findByTestId('driver-week-fuel');
    await waitFor(() => expect(within(card).getAllByTestId('driver-week-fuel-line-current')).toHaveLength(3));
    const rows = within(card).getAllByTestId('driver-week-fuel-line-current');
    expect(rows[0].textContent).toContain('5179KZ');
    expect(rows[0].textContent).toContain('Uber trips');
    expect(rows[0].textContent).toContain('1,320 km');
    expect(rows[0].textContent).toContain('J$16.30');
    expect(rows[0].textContent).toContain('20%');
    expect(rows[0].textContent).toContain('J$4,303.39');
    expect(rows[2].textContent).toContain('Unexplained km');
    expect(within(card).getByTestId('driver-week-fuel-total').textContent).toBe('J$5,648.20');
    expect(within(card).getByTestId('driver-week-fuel-match').textContent).toBe('Matches the fuel statement for this week.');
    expect(card.textContent).not.toContain('Status');
    fireEvent.click(within(card).getByRole('button', { name: /View week/ }));
    expect(onViewWeek).toHaveBeenCalledWith('2026-11-16');
    for (const w of ['Driver ID', 'Contract', 'Dual-custody', 'telematics', 'Dual-Signoff', 'Rubis', 'Approve Payout', 'Itemized']) {
      expect(card.textContent).not.toContain(w);
    }
  });

  it('a red line names the difference when the lines do not match the statement', async () => {
    render(<DriverWeekFuelCard driverId="kenny" weekStart="2026-11-16" load={async () => respond(screen13, true, 560_000)} />);
    const m = await screen.findByTestId('driver-week-fuel-match');
    expect(m.textContent).toContain("Doesn't match the fuel statement");
    expect(m.textContent).toContain('J$5,648.20');
    expect(m.textContent).toContain('J$5,600.00');
    expect(m.textContent).toContain('J$48.20 apart');
  });

  it('screen 14: reversed line struck through above the new one, Current chips, who reopened', async () => {
    render(
      <DriverWeekFuelCard
        driverId="kenny"
        weekStart="2026-11-16"
        load={async () =>
          respond(
            [
              line({ id: 'new', km: 1300, driver_amount_minor: 423_819 }),
              line({ id: 'pick', purpose: 'to_pickups', km: 150, driver_pct: 50, driver_amount_minor: 122_255 }),
              line({ id: 'unx', purpose: 'unexplained_km', km: 35, driver_pct: 50, driver_amount_minor: 28_526 }),
              line({ id: 'old', reversed_at: '2026-11-24T14:12:00Z', reversed_by: 'u1' }),
            ],
            true,
            574_600,
          )
        }
      />,
    );
    const card = await screen.findByTestId('driver-week-fuel');
    await waitFor(() => expect(within(card).getAllByTestId('driver-week-fuel-line-reversed')).toHaveLength(1));
    const all = within(card).getAllByTestId(/driver-week-fuel-line-/);
    expect(all[0].getAttribute('data-testid')).toBe('driver-week-fuel-line-reversed');
    expect(all[0].textContent).toContain('Reversed Tue 24 Nov (week reopened)');
    expect(all[1].textContent).toContain('1,300 km');
    expect(all[1].textContent).toContain('Current');
    expect(within(card).getByTestId('driver-week-fuel-total').textContent).toBe('J$5,746.00');
    expect(card.textContent).toContain('Reopened lines are kept, never edited.');
    expect(within(card).getByTestId('driver-week-fuel-reopened').textContent).toContain('Reopened by Deeki T · Tue 24 Nov, 9:12 AM');
    for (const w of ['Immutable', 'Audit Revision', 'batch disbursement', 'Probox']) expect(card.textContent).not.toContain(w);
  });

  it('old-way week: one Fuel deduction row; open week: the charge appears when it locks', async () => {
    const { unmount } = render(<DriverWeekFuelCard driverId="kenny" weekStart="2026-11-09" load={async () => respond([], true, 408_136)} />);
    const old = await screen.findByTestId('driver-week-fuel-old-way');
    expect(old.textContent).toContain('Fuel deduction');
    expect(old.textContent).toContain('Locked before fuel lines existed');
    expect(old.textContent).toContain('J$4,081.36');
    unmount();
    render(<DriverWeekFuelCard driverId="kenny" weekStart="2026-11-23" load={async () => respond([], false, null)} />);
    expect((await screen.findByTestId('driver-week-fuel-open')).textContent).toContain('Fuel charge appears when the week locks');
  });
});
