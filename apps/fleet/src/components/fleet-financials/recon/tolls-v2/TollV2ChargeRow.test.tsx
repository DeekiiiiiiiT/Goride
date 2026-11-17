/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { TollV2ChargeRow } from './TollV2ChargeRow';
import type { TollV2Charge } from './types';

const pickCharge: TollV2Charge = {
  id: 'pick-1',
  version: 1,
  section: 'pick',
  state: 'pending',
  occurredAt: '2026-08-28T12:22:00-05:00',
  amountMinor: 37000,
  openMinor: 37000,
  plazaName: 'Portmore West',
  plate: '5179KZ',
  driverName: 'Kenny Gregory Rattray',
  confidence: 'two_trips',
  suggestions: [
    {
      suggestionId: 's1',
      paybackId: 'p1',
      paybackVersion: 1,
      paidBackMinor: 37000,
      trip: {
        requestAt: '2026-08-28T11:50:00-05:00',
        dropoffAt: '2026-08-28T12:28:00-05:00',
        paymentMethod: 'cash',
      },
    },
  ],
  decision: null,
};

describe('TollV2ChargeRow pick branch', () => {
  it('keeps date on one line at 1024px', () => {
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1024 });
    render(<TollV2ChargeRow charge={pickCharge} actions={{}} />);
    const when = screen.getByTestId('toll-v2-pick-when');
    expect(when.className).toMatch(/whitespace-nowrap/);
    expect(when.textContent).toMatch(/28 Aug, 12:22 PM/);
    expect(screen.getByText('Choose trip:')).toBeTruthy();
  });
});

describe('TollV2ChargeRow no-trip: driver status from the activity timeline', () => {
  const base: TollV2Charge = {
    id: 'nt-1',
    version: 1,
    section: 'no_trip',
    state: 'pending',
    occurredAt: '2026-10-28T11:30:00-05:00',
    amountMinor: 25000,
    openMinor: 25000,
    plazaName: 'Spanish Town',
    plate: '5179KZ',
    driverName: 'Kenny Gregory Rattray',
    decision: null,
  };
  const actions = { onDriverPays: () => {}, onFleetPays: () => {} };

  it('offline crossing: red mark with the time, Driver pays first and filled', () => {
    render(<TollV2ChargeRow charge={{ ...base, driverStatus: 'offline', offlineFlag: true }} actions={actions} />);
    expect(screen.getByTestId('toll-v2-offline-flag').textContent).toMatch(/Driver offline at 11:30 AM/);
    const buttons = screen.getAllByRole('button').map((b) => b.textContent);
    expect(buttons).toEqual(['Driver pays', 'Fleet pays']);
    const driverPays = screen.getByRole('button', { name: 'Driver pays' });
    const fleetPays = screen.getByRole('button', { name: 'Fleet pays' });
    expect(driverPays.className).not.toBe(fleetPays.className);
  });

  it('online crossing: plain note, no red mark, both buttons look the same', () => {
    render(<TollV2ChargeRow charge={{ ...base, driverStatus: 'online', offlineFlag: false }} actions={actions} />);
    expect(screen.queryByTestId('toll-v2-offline-flag')).toBeNull();
    expect(screen.getByTestId('toll-v2-status-online')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Driver pays' }).className).toBe(
      screen.getByRole('button', { name: 'Fleet pays' }).className,
    );
  });

  it('day with no timeline says so; a decided row never shows the mark', () => {
    const { unmount } = render(<TollV2ChargeRow charge={{ ...base, driverStatus: 'no_timeline' }} actions={actions} />);
    expect(screen.getByTestId('toll-v2-status-no-timeline').textContent).toBe('No activity timeline for this day');
    unmount();
    render(
      <TollV2ChargeRow
        charge={{ ...base, section: 'decided', state: 'decided', driverStatus: 'offline', offlineFlag: false,
          decision: { kind: 'driver_pays' } as TollV2Charge['decision'] }}
        actions={actions}
      />,
    );
    expect(screen.queryByTestId('toll-v2-offline-flag')).toBeNull();
  });
});

describe('Tolls with no trip header: offline crossings line', () => {
  it('counts and totals only the flagged crossings', async () => {
    const { TollV2Sections } = await import('./TollV2Sections');
    const mk = (id: string, minor: number, flag: boolean): TollV2Charge => ({
      id, version: 1, section: 'no_trip', state: 'pending', occurredAt: '2026-10-28T11:30:00-05:00',
      amountMinor: minor, openMinor: minor, offlineFlag: flag, driverStatus: flag ? 'offline' : 'online', decision: null,
    });
    render(
      <TollV2Sections
        charges={[mk('a', 25000, true), mk('b', 18000, false), mk('c', 7000, true)]}
        paybacks={[]}
        kept={[]}
        rowActions={{}}
        sureCount={0}
        sealed={false}
      />,
    );
    expect(screen.getByTestId('toll-v2-offline-summary').textContent).toMatch(/^2 crossed while the driver was offline · J\$320\.00$/);
  });
});
